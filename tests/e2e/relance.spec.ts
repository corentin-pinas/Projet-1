import { expect, test, type Page } from "@playwright/test";

/* Relances automatiques (1.5.1, choix de Corentin du 6 novembre 2026) : après un échec passager, nouvel essai toutes
   les 5 minutes, 3 essais au plus, avec la cause et un compte à rebours ; jamais quand relancer ne changerait rien. */
const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 5000, output_tokens: 2000 }
});
const DICTEE = "avec Marc douleur 3 sur 10 renforcement des rotateurs externes";
const REPONSE = { seances: [{ nom: "Marc", extrait: DICTEE.slice(10), propre: "État du patient : douleur 3/10.\nFait en séance : renforcement des rotateurs externes.", resume: null, rdv_date: null, rdv_heure: null }] };

/* l'IA (clé API simulée) : panne tant que « panne » le dit, sinon répond ; erreur : la panne à imiter */
async function preparer(page: Page, panne: { n: number; statut: number; corps?: unknown }) {
  const essais = { dictee: 0 };
  await page.route("https://api.anthropic.com/**", async route => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const texte = (req.postDataJSON() as { messages: { content: { text?: string }[] }[] }).messages[0].content.map(b => b.text ?? "").join("");
    if (!texte.includes("dictée groupée")) return route.fulfill({ json: message({ propre: null, resume: null, rdv_date: null, rdv_heure: null }) });
    essais.dictee++;
    if (panne.n-- > 0) return route.fulfill({ status: panne.statut, json: panne.corps ?? { type: "error", error: { type: "api_error", message: "panne" } } });
    return route.fulfill({ json: message(REPONSE) });
  });
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  await page.locator("#q").fill("Marc Dupont");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
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
  return essais;
}

test("dictée : l'IA ne répond pas, la cause et le compte à rebours s'affichent, le nouvel essai part seul 5 minutes plus tard", async ({ page }) => {
  // la panne dure le temps du premier essai (l'outil de l'IA réessaie déjà 2 fois de lui-même en quelques secondes)
  const essais = await preparer(page, { n: 3, statut: 500 });
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  const boite = page.locator(".relance");
  await expect(boite).toContainText("Rangement pas encore fait", { timeout: 20_000 });
  await expect(boite).toContainText("momentanément indisponible");
  await expect(boite).toContainText("essai 2 sur 3");
  await expect(boite.locator("[data-rebours]")).toContainText(/^[45] min/);
  await expect(page.locator("#dtexte")).toHaveValue(DICTEE);   // la dictée est gardée
  const avant = essais.dictee;
  await page.clock.fastForward("05:01");
  await expect(page.locator(".recap")).toContainText("1 séance rangée : Marc D.", { timeout: 20_000 });
  expect(essais.dictee).toBe(avant + 1);
});

test("dictée : « Réessayer maintenant » n'attend pas ; après 3 essais ratés, plus de relance", async ({ page }) => {
  await preparer(page, { n: 99, statut: 500 });
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".relance")).toContainText("essai 2 sur 3", { timeout: 20_000 });
  await page.getByRole("button", { name: "Réessayer maintenant" }).click();
  await expect(page.locator(".relance")).toContainText("essai 3 sur 3", { timeout: 20_000 });
  await page.getByRole("button", { name: "Réessayer maintenant" }).click();
  await expect(page.locator(".toast")).toContainText("Votre dictée est gardée.", { timeout: 20_000 });
  await expect(page.locator(".relance")).toHaveCount(0);
  await expect(page.locator("#dtexte")).toHaveValue(DICTEE);
});

test("dictée : clé refusée, relancer ne changerait rien : pas de nouvel essai", async ({ page }) => {
  const essais = await preparer(page, { n: 99, statut: 401, corps: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".toast")).toContainText("La clé de l'IA est refusée", { timeout: 20_000 });
  await expect(page.locator(".relance")).toHaveCount(0);
  const avant = essais.dictee;
  await page.clock.fastForward("06:00");
  await page.waitForTimeout(500);
  expect(essais.dictee).toBe(avant);
});

test("voix sur la fiche : le PC ne répond pas, l'enregistrement est gardé et la transcription repart seule 5 minutes plus tard", async ({ page }) => {
  let coupe = true;
  await page.route("**/api/voix/transcrire**", route => coupe ? route.abort() : route.continue());
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill("http://127.0.0.1:4747");
  await page.locator("#synccode").fill("essa-ipcm-unin");
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator("#syncvoix")).toContainText("Whisper est prêt sur le PC");
  await page.locator("#etatclose").click();
  await page.locator("#q").fill("Paul Relance");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.getByRole("button", { name: /Enregistrer ma séance/ }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator("#svoix")).toContainText("Un enregistrement de votre voix est gardé", { timeout: 15_000 });
  await expect(page.locator("#svoix")).toContainText("Le PC est injoignable");
  await expect(page.locator("#svoix")).toContainText("essai 2 sur 3");
  coupe = false;
  await page.clock.fastForward("05:01");
  await expect(page.locator(".seance")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".seance")).toContainText("transcrit sur le PC");
});

test("deux fenêtres de Muninn ouvertes sur le même appareil : un bilan n'est résumé qu'une fois (pas de quota consommé deux fois)", async ({ browser }) => {
  const ctx = await browser.newContext();
  let bilans = 0;
  await ctx.route("https://api.anthropic.com/**", async route => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    bilans++;
    await new Promise(r => setTimeout(r, 3000));   // un résumé prend du temps
    return route.fulfill({ json: message({ region: "Épaule D", date_bilan: null, age: 50, coup_oeil: "Bilan test.", chiffres: [], sections: [], a_verifier: [] }) });
  });
  const a = await ctx.newPage();
  await a.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await a.goto("/");
  await a.locator("#regbtn").click(); await a.locator("#etatbtn").click();
  await a.getByText("Secours : clé API").click();
  await a.getByLabel("Autoriser l'usage d'une clé API").check();
  await a.getByLabel("Utiliser la clé API").check();
  await a.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await a.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(a.getByRole("status")).toContainText("Clé vérifiée");
  await a.locator("#etatclose").click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await a.locator("#file").setInputFiles([{ name: "Bilan - Lucie MARTIN.png", mimeType: "image/png", buffer: png }]);
  await expect.poll(() => bilans).toBe(1);
  // la seconde fenêtre s'ouvre pendant que la première résume : elle voit le bilan sans résumé, mais passe son tour
  const b = await ctx.newPage();
  await b.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await b.goto("/");
  await expect(a.locator("#list .item", { hasText: "Lucie M." })).not.toContainText("en cours", { timeout: 15_000 });
  await b.waitForTimeout(1000);
  expect(bilans).toBe(1);
  await ctx.close();
});
