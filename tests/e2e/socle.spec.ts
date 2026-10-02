import { expect, test } from "@playwright/test";

const ouvrirEtat = async (page: import("@playwright/test").Page) => {
  await page.locator("#etatbtn").click();
  await expect(page.getByRole("dialog", { name: "État de l'appli" })).toBeVisible();
};

test("l'état de l'appli affiche les vérifications d'installation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Mes patients");
  // ouverte dans le navigateur, pas depuis l'icône : le bouton d'état signale un point à voir
  await expect(page.locator("#etatbtn")).toHaveClass(/alerte/);
  await ouvrirEtat(page);
  await expect(page.locator("#checks .verif")).toHaveCount(4);
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
  await ouvrirEtat(page);
  await expect(page.locator('[data-id="hors-connexion"]')).toHaveClass(/ok/, { timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mes patients" })).toBeVisible();
  await context.setOffline(false);
});

test("« Vérifier à nouveau » répond par un message", async ({ page }) => {
  await page.goto("/");
  await ouvrirEtat(page);
  await page.getByRole("button", { name: "Vérifier à nouveau" }).click();
  await expect(page.getByRole("status")).toContainText("Vérifié");
});

test("un refus de protection est expliqué", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, "persisted", { value: async () => false });
    Object.defineProperty(navigator.storage, "persist", { value: async () => false });
  });
  await page.goto("/");
  await ouvrirEtat(page);
  await page.getByRole("button", { name: "Protéger mes données" }).click();
  await expect(page.getByRole("status")).toContainText("refusé");
  await expect(page.locator('[data-id="stockage"]')).toContainText("refusé");
  await expect(page.getByRole("button", { name: "Protéger mes données" })).toBeHidden();
});
