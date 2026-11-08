import { expect, test } from "@playwright/test";

/* « Prochain rendez-vous ? » (choix de Corentin, 5 novembre 2026) : posée après une séance qui ne dit pas quand le patient revient */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));

const dans = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };

test("après une séance sans rendez-vous : la question, puis « Après-midi » pose le rendez-vous ; « Fin de traitement » la fait taire", async ({ page }) => {
  await page.goto("/");
  await page.locator("#q").fill("Paul Rdv");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await expect(page.locator(".question-rdv")).toHaveCount(0);           // pas encore de séance : pas de question
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Mobilisation passive, douleur 4 sur 10.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();

  const q = page.locator(".question-rdv");
  await expect(q).toContainText("Prochain rendez-vous ?");
  await q.locator("input[type=date]").fill(dans(8));
  await q.getByRole("button", { name: "Après-midi" }).click();
  await expect(page.locator(".toast")).toContainText("Rendez-vous enregistré");
  await expect(page.locator(".rdv")).toContainText("après-midi");
  await expect(q).toHaveCount(0);

  // le rendez-vous effacé, la question revient ; « Fin de traitement » la fait taire, « Rouvrir le dossier » la ramène
  await page.locator("#rbtn").click();
  await page.locator("#rclear").click();
  await expect(page.locator(".question-rdv")).toBeVisible();
  await page.locator(".question-rdv").getByRole("button", { name: "Fin de traitement" }).click();
  await expect(page.locator(".rdv")).toContainText("Dossier archivé");
  await expect(page.locator(".question-rdv")).toHaveCount(0);
  await page.getByRole("button", { name: "Rouvrir le dossier" }).click();
  await expect(page.locator(".question-rdv")).toBeVisible();
});
