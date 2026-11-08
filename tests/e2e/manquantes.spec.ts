import { expect, test, type Page, type Route } from "@playwright/test";

/* Séances manquantes (choix de Corentin, 5 novembre 2026) : patient oublié par l'IA retrouvé dans la dictée gardée ;
   jour de rendez-vous sans séance sur la fiche, « Il était absent » ; recherche un autre jour. */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));

const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50 }
});
const PASSAGE = "Victor douleur à 4 il dort mieux on a travaillé la rotation externe contre résistance élastique";
const MARC = "mobilisation passive de l'épaule droite en abduction et en rotation externe, puis renforcement des rotateurs externes avec élastique rouge, trois séries de quinze, massage du trapèze supérieur, il dit que la douleur nocturne a beaucoup diminué depuis la semaine dernière et qu'il a repris le jardinage sans gêne, à la maison il continue les pendulaires et les étirements de la capsule postérieure deux fois par jour";
const DICTEE = "avec Marc " + MARC + " ensuite " + PASSAGE;   // Victor : moins de 40 % du texte, la dictée passe le contrôle

async function preparer(page: Page, dossiers: unknown[], seances: unknown[] = []) {
  await page.goto("/");
  await page.evaluate(async ({ dossiers, seances }) => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(["dossiers", "seances"], "readwrite");
    for (const d of dossiers) tx.objectStore("dossiers").put(d);
    for (const s of seances) tx.objectStore("seances").put(s);
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, { dossiers, seances });
  await page.reload();
}

test("dictée groupée : l'IA oublie Victor, Muninn le signale, le retrouve dans la dictée gardée et range sa séance", async ({ page }) => {
  const demandes: string[] = [];
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const texte = (req.postDataJSON().messages[0].content as { text?: string }[]).map(b => b.text ?? "").join("");
    demandes.push(texte);
    if (texte.includes("Retrouve le passage")) return route.fulfill({ json: message({ trouve: true, extrait: PASSAGE }) });
    if (texte.includes("dictée groupée")) return route.fulfill({ json: message({ seances: [
      { nom: "Marc", extrait: MARC, propre: "Fait en séance : " + MARC + ".", resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }] }) });
    return route.fulfill({ json: message({ propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }) });
  });
  await preparer(page, [
    { id: "m", label: "Marc D.", rdvs: [{ d: iso(0), h: "", p: "pm" }], homonyme: false, cree: "" },
    { id: "v", label: "Victor M.", rdvs: [{ d: iso(0), h: "", p: "pm" }], homonyme: false, cree: "" }
  ]);
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();

  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill(DICTEE);
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".recap")).toContainText("1 séance rangée : Marc D.");
  const trou = page.locator(".recap .trou", { hasText: "Victor M." });
  await expect(trou).toContainText("rendez-vous prévu, aucune séance notée");
  await trou.getByRole("button", { name: "Retrouver dans mes dictées" }).click();
  const trouve = page.locator(".recap .trouve");
  await expect(trouve).toContainText("il dort mieux");
  expect(demandes.some(d => d.includes("Retrouve le passage") && d.includes("Victor M.") && d.includes(PASSAGE))).toBe(true);   // la dictée gardée est relue
  await trouve.getByRole("button", { name: "Ranger cette séance" }).click();
  await expect(page.locator(".toast")).toContainText("Séance rangée");
  await expect(page.locator(".recap .trou, .recap .trouve")).toHaveCount(0);

  await page.locator("#dfermer").click();
  await page.locator("#list .item", { hasText: "Victor M." }).click();
  await expect(page.locator(".seance")).toHaveCount(1);
  await expect(page.locator(".seance")).toContainText("il dort mieux");
});

test("fiche : un rendez-vous passé sans séance est signalé ; « Il était absent » le note ; recherche un autre jour", async ({ page }) => {
  await preparer(page,
    [{ id: "v", label: "Victor M.", rdvs: [{ d: iso(-3), h: "", p: "am" }, { d: iso(-10), h: "", p: "am" }], homonyme: false, cree: "" }],
    [{ id: "s1", dossierId: "v", date: iso(-10), cree: new Date().toISOString(), contenu: "Mobilisation passive." }]);
  await page.locator("#list .item", { hasText: "Victor M." }).click();
  const trou = page.locator(".trou");
  await expect(trou).toHaveCount(1);
  await expect(trou).toContainText("matin : rendez-vous prévu, aucune séance notée");
  // le jour manquant est placé avant la séance plus ancienne
  await expect(page.locator(".seances > .trou + .seance")).toHaveCount(1);
  await trou.getByRole("button", { name: "Il était absent" }).click();
  await expect(page.locator(".absence")).toContainText("Absent le");
  await expect(page.locator(".trou")).toHaveCount(0);
  await page.locator(".absence").getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator(".trou")).toHaveCount(1);

  // un autre jour, sans IA réglée : la recherche explique quoi faire
  await page.getByRole("button", { name: /Une séance manque un autre jour/ }).click();
  await page.locator(".autrejour input[type=date]").fill(iso(-5));
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page.locator(".trou", { hasText: "Réglez d'abord l'IA" })).toBeVisible();
});
