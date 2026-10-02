import { expect, test, type Page, type Route } from "@playwright/test";

/* L'IA est simulée : aucune vraie requête ne part, on vérifie ce que l'appli envoie et ce qu'elle fait de la réponse. */
type Envoi = { model: string; fallbacks: unknown; messages: { content: { type: string; text?: string }[] }[]; output_config: { effort: string } };

function message(json: unknown) {
  return {
    id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: JSON.stringify(json) }],
    stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 9000, output_tokens: 3000 }
  };
}

const RESUME = {
  region: "Épaule D", date_bilan: "18/09/2026", age: 52,
  coup_oeil: "Douleur antérieure d'épaule droite depuis 2 mois, au port de charges.",
  chiffres: [{ label: "EVA", valeur: "5/10" }], sections: [{ titre: "Examen", items: ["Jobe +"] }],
  a_verifier: ["« RE2 » lu « 30° »"]
};

async function simulerIA(page: Page, reponses: { bilan?: unknown; seance?: unknown }) {
  const envois: Envoi[] = [];
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const corps = req.postDataJSON() as Envoi;
    envois.push(corps);
    const estBilan = corps.messages[0].content.some(b => b.type === "document" || b.type === "image");
    return route.fulfill({ json: message(estBilan ? reponses.bilan : reponses.seance) });
  });
  return envois;
}

async function enregistrerCle(page: Page) {
  await page.locator("#etatbtn").click();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await expect(page.locator('[data-id="ia"]')).toHaveClass(/ok/);
  await page.getByRole("button", { name: "Fermer" }).click();
}

async function fairePdf(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setContent("<h1>Bilan test</h1>");
  const b = await p.pdf();
  await p.close();
  return b;
}

test("sans clé, le bilan attend et l'appli explique quoi faire", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".wait")).toContainText("enregistrez la clé de l'IA");
});

test("une clé mal copiée est refusée avant tout envoi", async ({ page }) => {
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.locator("#iacle").fill("ma-cle");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("commence par sk-ant-");
});

test("le bilan déposé se résume tout seul", async ({ page }) => {
  const envois = await simulerIA(page, { bilan: RESUME });
  await page.goto("/");
  await enregistrerCle(page);
  await page.locator("#file").setInputFiles([{ name: "Fiche Bilan Épaule - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".glance")).toContainText("Douleur antérieure", { timeout: 15_000 });
  await expect(page.locator(".chip")).toContainText("5/10");
  await expect(page.locator(".vitem")).toContainText("RE2");
  await expect(page.locator("#main .meta").first()).toContainText("52 ans, Épaule D, bilan du 18/09/2026");
  // ce qui est parti vers l'IA : le PDF en document, le bon modèle, le repli automatique en cas de refus
  expect(envois).toHaveLength(1);
  expect(envois[0].model).toBe("claude-opus-5-5");
  expect(envois[0].fallbacks).toBe("default");
  expect(envois[0].messages[0].content[0].type).toBe("document");
  // la consommation est comptée
  await page.locator("#etatbtn").click();
  await expect(page.locator("#iaetat")).toContainText("1 bilan résumé");
});

test("un échec de l'IA est expliqué et le résumé peut être relancé", async ({ page }) => {
  let essais = 0;
  await page.route("https://api.anthropic.com/**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model" } });
    essais++;
    if (essais === 1) return route.fulfill({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
    return route.fulfill({ json: message(RESUME) });
  });
  await page.goto("/");
  await enregistrerCle(page);
  await page.locator("#file").setInputFiles([{ name: "Bilan - Paul ROUX.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".wait")).toContainText("La clé de l'IA est refusée", { timeout: 15_000 });
  await expect(page.locator("#list .item")).toContainText("Résumé à refaire");
  await page.getByRole("button", { name: "Réessayer le résumé" }).click();
  await expect(page.locator(".glance")).toContainText("Douleur antérieure", { timeout: 15_000 });
});

test("la séance dictée est mise au propre et le rendez-vous dicté se place tout seul", async ({ page }) => {
  const dans7 = new Date(Date.now() + 7 * 864e5);
  const iso = `${dans7.getFullYear()}-${String(dans7.getMonth() + 1).padStart(2, "0")}-${String(dans7.getDate()).padStart(2, "0")}`;
  const propre = "État du patient : va mieux, douleur 3/10.\nFait en séance : renforcement des rotateurs externes.\nÀ venir : tester la force en rotation externe, dans une semaine à 8 h.";
  const envois = await simulerIA(page, { bilan: RESUME, seance: { propre, resume: "Tester la force en RE.", rdv_date: iso, rdv_heure: "08:00" } });
  await page.goto("/");
  await enregistrerCle(page);
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".glance")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("euh le patient dit que ça va mieux douleur à trois sur dix on a fait du renforcement des rotateurs externes pour la prochaine séance tester la force en rotation externe dans une semaine à 8 heures");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();

  await expect(page.locator(".seance .sc").first()).toContainText("Fait en séance :", { timeout: 15_000 });
  await expect(page.locator(".avenir")).toContainText("Tester la force en RE.");
  await expect(page.locator(".rdv")).toContainText("à 8 h");
  await expect(page.locator(".seance details.orig")).toContainText("Texte d'origine");
  const envoiSeance = envois.find(e => e.messages[0].content[0].type === "text")!;
  expect(envoiSeance.messages[0].content[0].text).toContain("J+7 :");
  expect(envoiSeance.output_config.effort).toBe("medium");
});
