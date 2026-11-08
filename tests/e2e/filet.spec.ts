import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

/* Paquet « filet de sécurité » de l'audit : voix gardée (M1), séance reprise (M3), saisie protégée (M7), annulation limitée (M4). */
const PC = "http://127.0.0.1:4747", CODE = "essa-ipcm-unin";
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

test("M1 : une voix en cours d'enregistrement n'est jamais jetée en changeant d'écran, même si l'appli se ferme", async ({ browser }) => {
  const page = await nouvellePage(browser);
  await page.locator("#q").fill("Paul Garde");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(CODE);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast")).toContainText("Relié au PC");
  await page.locator("#etatclose").click();

  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.getByRole("button", { name: /Enregistrer ma séance/ }).click();
  await expect(page.locator("#svoix .voix")).toContainText("Enregistrement");
  await page.waitForTimeout(1200);
  await page.locator("#majournee").click();                       // fausse manœuvre : retour à « Ma journée »
  await expect(page.locator(".toast")).toContainText("Enregistrement arrêté et gardé");
  await page.waitForTimeout(300);
  await page.reload();                                              // l'appli se ferme et se rouvre

  await page.locator("#list .item", { hasText: "Paul G." }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await expect(page.locator("#svoix")).toContainText("est gardé");
  await page.getByRole("button", { name: "Réessayer la transcription" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);
  await expect(page.locator(".seance")).toContainText("transcrit sur le PC");
  await page.context().close();
});

test("M3 : une séance jamais mise au propre (réseau coupé) est reprise toute seule à l'ouverture", async ({ browser }) => {
  const page = await nouvellePage(browser);
  await simulerIA(page, () => ({ propre: "État du patient : douleur 3/10.\nFait en séance : mobilisation passive.", resume: null, bref: "Douleur 3/10.", rdv_date: null, rdv_heure: null, rdv_demi: null }));
  await semer(page, {
    parametres: [{ cle: "appareil", valeur: "tablette-test" }],
    dossiers: [{ id: "p", label: "Paul R.", rdvs: [], homonyme: false, cree: "" }],
    seances: [{ id: "s1", dossierId: "p", date: iso(-1), cree: new Date(Date.now() - 3600e3).toISOString(), contenu: "douleur 3 sur 10 mobilisation passive", origine: "tablette-test" }]
  });
  await cleAPI(page);
  await page.reload();
  await page.locator("#list .item", { hasText: "Paul R." }).click();
  await expect(page.locator(".seance")).toContainText("État du patient", { timeout: 15_000 });
  await page.context().close();
});

test("M7 : une correction « à vérifier » en cours de frappe survit au retour sur l'appli", async ({ browser }) => {
  const page = await nouvellePage(browser);
  await semer(page, {
    dossiers: [{ id: "d", label: "Marc D.", rdvs: [], homonyme: false, cree: "" }],
    bilans: [{ id: "b", dossierId: "d", fichier: "Bilan Marc D", fichiers: [], ajoute: "2026-10-05T10:00:00Z", valides: [], corrections: [],
      resume: { region: "Épaule D", date_bilan: "05/10/2026", age: 52, coup_oeil: "Tendinopathie.", chiffres: [], sections: [], a_verifier: ["Âge : 52 ou 57 ?", "EVA : 4 ou 9 ?"] } }]
  });
  await page.locator("#list .item", { hasText: "Marc D." }).click();
  await page.locator(".vitem").first().getByRole("button", { name: "Corriger" }).click();
  await page.locator(".vitem .vedit input").fill("57 ans");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));   // retour d'une autre appli
  await page.waitForTimeout(300);
  await expect(page.locator(".vitem .vedit input")).toHaveValue("57 ans");
  await page.locator(".vitem .vedit").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".toast")).toContainText("Correction enregistrée");
  await expect(page.locator(".vitem")).toHaveCount(1);
  await expect(page.locator(".vitem")).toContainText("EVA");
  await page.context().close();
});

test("M4 : « Annuler cette dictée » ne touche pas au rendez-vous posé ensuite pour un autre patient", async ({ browser }) => {
  const page = await nouvellePage(browser);
  const ELISABETH = "massage cervical, travail proprioceptif, pour la prochaine séance on revoit demain matin";
  await simulerIA(page, t => t.includes("dictée groupée")
    ? { seances: [{ nom: "Élisabeth G.", extrait: ELISABETH, propre: "Fait en séance : massage cervical.", resume: null, bref: null, rdv_date: iso(1), rdv_heure: null, rdv_demi: "matin" }] }
    : { propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null });
  await semer(page, { dossiers: [
    { id: "e", label: "Élisabeth G.", rdvs: [{ d: iso(0), h: "", p: "am" }], homonyme: false, cree: "" },
    { id: "l", label: "Lucie M.", rdvs: [], homonyme: false, cree: "" }] });
  await cleAPI(page);
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill("avec Élisabeth " + ELISABETH);
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".recap")).toContainText("1 séance rangée : Élisabeth G.");
  // pendant ce temps, un rendez-vous est posé pour Lucie (ici ou reçu d'un autre appareil)
  await page.evaluate(async d => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction("dossiers", "readwrite");
    tx.objectStore("dossiers").put({ id: "l", label: "Lucie M.", rdvs: [{ d, h: "", p: "pm" }], homonyme: false, cree: "" });
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, iso(3));
  await page.getByRole("button", { name: "Annuler cette dictée" }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler la dictée" }).click();
  await expect(page.locator("#dtexte")).toHaveValue(/Élisabeth/);
  const rdvs = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const l: { id: string; rdvs: { d: string }[] }[] = await new Promise(ok => { const q = db.transaction("dossiers").objectStore("dossiers").getAll(); q.onsuccess = () => ok(q.result); });
    return Object.fromEntries(l.map(x => [x.id, x.rdvs.map(r => r.d)]));
  });
  expect(rdvs.l).toEqual([iso(3)]);            // le rendez-vous de Lucie est resté
  expect(rdvs.e).toEqual([iso(0)]);            // celui posé par la dictée pour Élisabeth est retiré
  await page.context().close();
});
