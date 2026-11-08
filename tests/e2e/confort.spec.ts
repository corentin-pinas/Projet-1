import { expect, test } from "@playwright/test";

/* Petit confort (1.5.3, choix de Corentin du 8 novembre 2026). */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));

test("une fenêtre se ferme en touchant à côté ; si quelque chose a été tapé dedans, Muninn demande d'abord", async ({ page }) => {
  await page.goto("/");
  await page.locator("#regbtn").click();
  await expect(page.locator("#regdlg")).toBeVisible();
  await page.mouse.click(8, 8);                                     // à côté de la fenêtre
  await expect(page.locator("#regdlg")).toBeHidden();

  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await expect(page.locator("#etatdlg")).toBeVisible();
  await page.locator("#abocode").fill("un code pas enregistré");   // une saisie en cours
  await page.mouse.click(8, 8);
  await expect(page.locator("dialog.confirm")).toContainText("Fermer sans enregistrer ?");
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator("#etatdlg")).toBeVisible();             // rien n'est perdu
  await expect(page.locator("#abocode")).toHaveValue("un code pas enregistré");
  await page.mouse.click(8, 8);
  await page.locator("dialog.confirm").getByRole("button", { name: "Fermer sans enregistrer" }).click();
  await expect(page.locator("#etatdlg")).toBeHidden();
});

test("« État de l'appli » est dans les Réglages ; la roue devient orange quand un point est à voir", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".basbar #etatbtn")).toHaveCount(0);   // plus de bouton à part
  await expect(page.locator("#regbtn")).toHaveClass(/alerte/);      // navigateur de test : appli pas installée, IA pas réglée
  await page.locator("#regbtn").click();
  await expect(page.locator("#regdlg #etatbtn")).toContainText("État de l'appli");
  await page.locator("#etatbtn").click();
  await expect(page.locator("#regdlg")).toBeHidden();
  await expect(page.locator("#etatdlg")).toBeVisible();
});

test("Réglages : la barre du haut de la tablette peut être masquée (plein écran), gardé sur l'appareil", async ({ page }) => {
  await page.goto("/");
  await page.locator("#regbtn").click();
  const ligne = page.locator(".regligne", { hasText: "Barre du haut de la tablette" });
  await expect(ligne.getByRole("button", { name: "Visible" })).toHaveAttribute("aria-pressed", "true");
  await ligne.getByRole("button", { name: "Masquée" }).click();
  await expect(ligne.getByRole("button", { name: "Masquée" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("reglages-affichage") || "{}").pleinEcran)).toBe(true);
});
