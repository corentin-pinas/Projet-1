import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

/* Plusieurs rendez-vous dictés d'un coup, rendez-vous dits annulés proposés au retrait (choix de Corentin du 11 novembre 2026). */
const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50 }
});

async function nouvellePage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  return page;
}
async function semer(page: Page, magasins: Record<string, unknown[]>) {
  await page.evaluate(async magasins => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(Object.keys(magasins), "readwrite");
    for (const [nom, l] of Object.entries(magasins)) for (const x of l) tx.objectStore(nom).put(x);
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, magasins);
  await page.reload();
}
async function cleAPI(page: Page) {
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();
}
async function simulerIA(page: Page, reponse: (texte: string) => unknown) {
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const texte = (req.postDataJSON().messages[0].content as { text?: string }[]).map(b => b.text ?? "").join("");
    return route.fulfill({ json: message(reponse(texte)) });
  });
}


const dossierRdvs = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
  const d = await new Promise<{ rdvs: { d: string; p?: string }[]; retirer?: string[] }>(ok => { const q = db.transaction("dossiers").objectStore("dossiers").get("p"); q.onsuccess = () => ok(q.result); });
  return { rdvs: d.rdvs.map(r => r.d + " " + (r.p ?? "")), retirer: d.retirer ?? [] };
});

test("« on se voit demain, après-demain et dans 4 jours l'après-midi, plus dans 3 jours » : tout posé, sans doublon, l'annulé proposé", async ({ browser }) => {
  const page = await nouvellePage(browser);
  let tour = 0;
  await simulerIA(page, () => {
    tour++;
    return { propre: "Fait en séance : mobilisation passive.", resume: null, bref: "Mobilisation passive.", rdv_date: iso(1), rdv_heure: null, rdv_demi: null,
      rdv_autres: tour === 1 ? [{ date: iso(2), demi: null }, { date: iso(4), demi: "après-midi" }] : [{ date: iso(2), demi: null }, { date: iso(5), demi: null }],
      rdv_annules: tour === 1 ? [iso(3)] : [], fin_traitement: false };
  });
  await semer(page, {
    parametres: [{ cle: "appareil", valeur: "tablette-test" }],
    dossiers: [{ id: "p", label: "Philippe D.", rdvs: [{ d: iso(0), h: "", p: "am" }, { d: iso(3), h: "", p: "am" }], homonyme: false, cree: "" }]
  });
  await cleAPI(page);
  await page.locator("#list .item", { hasText: "Philippe D." }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Mobilisation passive. On se voit demain, après-demain, dans 4 jours l'après-midi ; finalement plus dans 3 jours.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".toast")).toContainText("Rendez-vous repérés pour Philippe D.");

  // tous les jours posés (matin = demi-journée de la séance), le rendez-vous annulé encore là mais proposé au retrait
  expect((await dossierRdvs(page)).rdvs).toEqual([`${iso(0)} am`, `${iso(1)} am`, `${iso(2)} am`, `${iso(3)} am`, `${iso(4)} pm`]);
  const q = page.locator(".retrait");
  await expect(q).toHaveCount(1);
  await expect(q).toContainText("annulé ?");
  await q.getByRole("button", { name: "Enlever" }).click();
  await expect(page.locator(".toast")).toContainText("Rendez-vous enlevé");
  await expect(page.locator(".retrait")).toHaveCount(0);
  expect(await dossierRdvs(page)).toEqual({ rdvs: [`${iso(0)} am`, `${iso(1)} am`, `${iso(2)} am`, `${iso(4)} pm`], retirer: [] });

  // le lendemain (ici : une nouvelle séance du jour), les mêmes jours redits : aucun doublon, seul le nouveau jour s'ajoute
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Massage. On se voit demain, après-demain et dans 5 jours.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".toast")).toContainText("Rendez-vous repérés pour Philippe D.");
  expect((await dossierRdvs(page)).rdvs).toEqual([`${iso(0)} am`, `${iso(1)} am`, `${iso(2)} am`, `${iso(4)} pm`, `${iso(5)} am`]);
  await page.context().close();
});
