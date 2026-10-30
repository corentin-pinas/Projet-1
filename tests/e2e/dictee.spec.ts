import { expect, test, type Page, type Route } from "@playwright/test";

/* Dictée groupée, avec l'IA simulée : on vérifie la demande envoyée et le rangement qui en découle. */
type Envoi = { model: string; messages: { content: { type: string; text?: string }[] }[] };

const iso = (decalage: number) => { const d = new Date(); d.setDate(d.getDate() + decalage); return d.toLocaleDateString("sv-SE"); };

const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 5000, output_tokens: 2000 }
});

const DICTEE = "avec Marc douleur 3 sur 10 renforcement des rotateurs externes ensuite Élisabeth G massage cervical pour la prochaine séance travail proprioceptif demain à 8 heures et Paul mobilisation passive de l'épaule";
const REPONSE = { seances: [
  { nom: "Marc", extrait: "douleur 3 sur 10 renforcement des rotateurs externes", propre: "État du patient : douleur 3/10.\nFait en séance : renforcement des rotateurs externes.", resume: null, rdv_date: null, rdv_heure: null },
  { nom: "Élisabeth G.", extrait: "massage cervical pour la prochaine séance travail proprioceptif demain à 8 heures", propre: "Fait en séance : massage cervical.\nÀ venir : travail proprioceptif, demain à 8 h.", resume: "Travail proprioceptif.", rdv_date: iso(1), rdv_heure: "08:00" },
  { nom: "Paul", extrait: "mobilisation passive de l'épaule", propre: "Fait en séance : mobilisation passive de l'épaule.", resume: null, rdv_date: null, rdv_heure: null }
] };

async function simulerIA(page: Page) {
  const envois: Envoi[] = [];
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const corps = req.postDataJSON() as Envoi;
    envois.push(corps);
    const texte = corps.messages[0].content.map(b => b.text ?? "").join("");
    if (texte.includes("dictée groupée")) return route.fulfill({ json: message(REPONSE) });
    if (corps.messages[0].content.some(b => b.type === "image")) return route.fulfill({ json: message({ region: "Épaule D", date_bilan: null, age: null, coup_oeil: "Bilan test.", chiffres: [], sections: [], a_verifier: [] }) });
    return route.fulfill({ json: message({ propre: null, resume: null, rdv_date: null, rdv_heure: null }) });
  });
  return envois;
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });

test("dictée groupée : un seul texte, rangé patient par patient, question seulement en cas de doute, puis annulation", async ({ page }) => {
  const envois = await simulerIA(page);
  await page.goto("/");
  for (const n of ["Marc DUPONT", "Marc LEBLANC", "Élisabeth GARCIA", "Sylvie FAURE"])
    await page.locator("#file").setInputFiles([{ name: `Bilan - ${n}.png`, mimeType: "image/png", buffer: png }]);
  await expect(page.locator("#list .item")).toHaveCount(4);

  // Marc D. a rendez-vous aujourd'hui : c'est lui, le « Marc » de la dictée
  await item(page, "Marc D.").click();
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rdv")).toContainText("aujourd'hui");

  // l'IA en mode clé API (simulée)
  await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();

  // la dictée est gardée même si l'appli se ferme
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill(DICTEE);
  await page.getByRole("button", { name: "Hier" }).click();
  await expect(page.locator(".dictee .note").first()).toContainText(new Date(Date.now() - 864e5).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
  await page.getByRole("button", { name: "Aujourd'hui" }).click();
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await expect(page.locator("#dtexte")).toHaveValue(DICTEE);

  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".recap")).toContainText("2 séances rangées : Marc D., Élisabeth G.");
  await expect(page.locator(".recap")).not.toContainText("G..");
  await expect(page.locator(".recap")).toContainText("Rendez-vous repéré pour Élisabeth G. : demain matin");
  const demande = envois.find(e => e.messages[0].content.some(b => b.text?.includes("dictée groupée")))!;
  expect(demande.model).toBe("claude-opus-5-5");
  expect(demande.messages[0].content[0].text).toContain("- Marc D. (rendez-vous ce jour-là)");

  // « Paul » n'est pas dans l'appli : la question est posée, rien n'est deviné
  await expect(page.locator(".doute")).toContainText("« Paul » : patient non reconnu");
  await expect(page.locator(".doute blockquote")).toContainText("mobilisation passive");
  await page.locator(".doute .cand", { hasText: "Sylvie F." }).click();
  await expect(page.locator(".recap")).toContainText("3 séances rangées : Marc D., Élisabeth G., Sylvie F.");
  await expect(page.locator(".doute")).toHaveCount(0);
  await expect(page.locator("#dtexte")).toHaveCount(0);   // la dictée a été vidée

  // chaque séance est une séance normale, mise au propre
  await item(page, "Marc D.").click();
  await expect(page.locator(".seance")).toContainText("renforcement des rotateurs externes.");
  await item(page, "Élisabeth G.").click();
  await expect(page.locator(".avenir")).toContainText("Travail proprioceptif.");
  await expect(page.locator("#list .grp", { hasText: "Demain" })).toHaveCount(1);

  // « Annuler » retire les séances, remet les rendez-vous et rend le texte dicté
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.getByRole("button", { name: "Annuler cette dictée" }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler la dictée" }).click();
  await expect(page.locator("#dtexte")).toHaveValue(DICTEE);
  await expect(page.locator("#list")).not.toContainText("séance");
  await expect(page.locator("#list .grp", { hasText: "Demain" })).toHaveCount(0);
});

test("deux patients au même prénom vus le même jour : l'appli demande lequel", async ({ page }) => {
  await simulerIA(page);
  await page.goto("/");
  for (const n of ["Marc DUPONT", "Marc LEBLANC"]) await page.locator("#file").setInputFiles([{ name: `Bilan - ${n}.png`, mimeType: "image/png", buffer: png }]);
  for (const [n, demi] of [["Marc D.", "Matin"], ["Marc L.", "Après-midi"]]) {
    await item(page, n).click();
    await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
    await page.getByLabel(demi).check();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  }
  await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await page.locator("#etatclose").click();

  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill(DICTEE);
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  const doute = page.locator(".doute", { hasText: "« Marc »" });
  await expect(doute).toContainText("plusieurs patients possibles");
  await expect(doute.locator(".cand")).toHaveCount(2);
  await expect(doute.locator(".cand").first()).toContainText("rendez-vous ce jour-là, matin");
  await doute.locator(".cand", { hasText: "Marc L." }).click();
  await expect(page.locator(".recap")).toContainText("Marc L.");
});

test("dictée enregistrée : la voix part vers Whisper (simulé) et le texte revient dans la dictée", async ({ page, request }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.png", mimeType: "image/png", buffer: png }]);
  // sans code d'accès au serveur, pas de bouton d'enregistrement
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await expect(page.locator(".dictee textarea")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enregistrer ma dictée/ })).toHaveCount(0);
  await page.locator("#dfermer").click();

  await page.locator("#etatbtn").click();
  await page.locator("#abocode").fill("code-acces-essai-123");
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await page.locator("#etatclose").click();

  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill("début tapé à la main");
  await page.getByRole("button", { name: /Enregistrer ma dictée/ }).click();
  await expect(page.locator(".voix")).toContainText("Enregistrement");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator("#dtexte")).toHaveValue("début tapé à la main\navec Marc douleur 3 sur 10 renforcement des rotateurs externes");
  await expect(page.getByRole("button", { name: /Enregistrer ma dictée/ })).toBeVisible();

  const recu = await (await request.get("http://localhost:4181/dernier")).json();
  expect(recu).toMatchObject({ model: "whisper-1", language: "fr", fichier: "dictee.webm" });
  expect(recu.prompt).toContain("coiffe des rotateurs");
  expect(recu.taille).toBeGreaterThan(1000);

  // le texte transcrit est gardé comme une dictée tapée
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await expect(page.locator("#dtexte")).toHaveValue(/rotateurs externes$/);
});

test("la transcription est réservée à qui connaît le code d'accès", async ({ request }) => {
  expect((await request.post("/api/ia/transcrire", { data: Buffer.from("x") })).status()).toBe(401);
  const r = await request.get("/api/ia/etat", { headers: { Authorization: "Bearer code-acces-essai-123" } });
  expect((await r.json()).transcription).toBe(true);
});
