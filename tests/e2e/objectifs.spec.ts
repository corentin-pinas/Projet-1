import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

/* Objectifs du patient (choix de Corentin du 12 novembre 2026) : lus dans le bilan, modifiés à la main, proposés par une dictée. */
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


test("objectifs : ceux du bilan, « Modifier », puis un objectif dit dans une séance proposé et ajouté", async ({ browser }) => {
  const page = await nouvellePage(browser);
  await simulerIA(page, () => ({ propre: "Fait en séance : course sur tapis.", resume: null, bref: "Course sur tapis.", rdv_date: null, rdv_heure: null, rdv_demi: null,
    rdv_autres: [], rdv_annules: [], objectifs: ["Courir 20 minutes sans douleur"], fin_traitement: false }));
  await semer(page, {
    parametres: [{ cle: "appareil", valeur: "tablette-test" }],
    dossiers: [{ id: "p", label: "Paul G.", rdvs: [{ d: iso(7), h: "", p: "am" }], homonyme: false, cree: "" }],
    bilans: [{ id: "b", dossierId: "p", fichier: "Bilan Paul G", fichiers: [], ajoute: "2026-10-05T10:00:00Z", valides: [], corrections: [],
      resume: { region: "Genou G", date_bilan: "05/10/2026", age: 40, coup_oeil: "Syndrome rotulien.", chiffres: [], sections: [], objectifs: ["Se coiffer sans douleur"], a_verifier: [] } }]
  });
  await cleAPI(page);
  await page.locator("#list .item", { hasText: "Paul G." }).click();
  const enc = page.locator(".objectifs");
  await expect(enc).toContainText("Se coiffer sans douleur");
  await expect(enc).toContainText("D'après le bilan");

  // à la main : un objectif de plus
  await enc.getByRole("button", { name: "Modifier" }).click();
  await page.locator("#objtexte").fill("Se coiffer sans douleur\nReprendre le tennis en mars");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".objectifs li")).toHaveText(["Se coiffer sans douleur", "Reprendre le tennis en mars"]);
  await expect(page.locator(".objectifs")).toContainText("Mis à jour le");

  // une séance énonce un nouvel objectif : proposé, jamais appliqué tout seul
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Course sur tapis. Nouvel objectif : courir 20 minutes sans douleur.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".toast")).toContainText("Objectif dit pour Paul G.");
  const p = page.locator(".objpropose");
  await expect(p).toContainText("Courir 20 minutes sans douleur");
  await expect(page.locator(".objectifs li")).toHaveCount(2);
  await p.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.locator(".objpropose")).toHaveCount(0);
  await expect(page.locator(".objectifs li")).toHaveText(["Se coiffer sans douleur", "Reprendre le tennis en mars", "Courir 20 minutes sans douleur"]);
  await expect(page.locator(".objectifs")).toContainText("(dictée)");
  await page.context().close();
});
