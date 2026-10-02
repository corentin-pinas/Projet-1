import { expect, test } from "@playwright/test";

test("l'écran d'accueil affiche les vérifications d'installation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mes patients");
  await expect(page.getByRole("heading", { name: "Mes patients" })).toBeVisible();
  await expect(page.locator("#checks .check")).toHaveCount(4);
  // ouverte dans le navigateur, pas depuis l'icône : l'écran explique comment installer
  await expect(page.locator('[data-id="installee"]')).toContainText("Ajouter à l'écran d'accueil");
});

test("le manifeste permet l'installation sur l'écran d'accueil", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifeste = await (await request.get(href!)).json();
  expect(manifeste.name).toBe("Mes patients");
  expect(manifeste.display).toBe("standalone");
  expect(manifeste.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const i of manifeste.icons) expect((await request.get(i.src)).ok()).toBe(true);
});

test("l'appli s'ouvre sans internet une fois chargée", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator('[data-id="hors-connexion"]')).toHaveClass(/ok/, { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mes patients" })).toBeVisible();
  await expect(page.locator('[data-id="hors-connexion"]')).toHaveClass(/ok/);
  await context.setOffline(false);
});
