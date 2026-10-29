import { expect, test } from "@playwright/test";

const choisir = (page: import("@playwright/test").Page, cle: string, val: unknown) => page.locator(`#regchoix [data-cle="${cle}"][data-val='${JSON.stringify(val)}']`).click();

test("réglages : noir et violet, texte plus grand, écriture arrondie, gardés après réouverture", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-15T09:00:00"));
  await page.goto("/");
  const html = page.locator("html");
  const taille = () => page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
  const avant = await taille();

  await page.getByRole("button", { name: "Réglages" }).click();
  await choisir(page, "fond", "sombre");
  await choisir(page, "couleur", "violet");
  await choisir(page, "taille", "grand");
  await choisir(page, "police", "nunito");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(html).toHaveAttribute("data-palette", "violet");
  await expect(page.locator('#regchoix [data-cle="couleur"][aria-pressed="true"]')).toHaveText("Violet");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().toUpperCase())).toBe("#B48CF0");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(18, 14, 23)");
  expect(await taille()).toBeGreaterThan(avant);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Nunito");
  await expect(page.locator('#regchoix [data-cle="couleur"]')).toHaveCount(11);
  await expect(page.locator('#regchoix [data-cle="police"]')).toHaveCount(8);
  await choisir(page, "police", "manuscrite");
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain("Patrick Hand");
  await choisir(page, "police", "nunito");
  await page.locator("#regfermer").click();
  // la mascotte (Muninn, le petit corbeau) réagit quand on la touche, chaque fois différemment
  const corbeau = page.getByRole("button", { name: /petit corbeau/ });
  await expect(corbeau).toBeVisible();
  await corbeau.click({ force: true });
  await expect(corbeau).toHaveClass(/croasse/);
  await expect(corbeau.locator(".m-bulle")).toHaveText("Croâ !");
  await corbeau.click({ force: true });
  await expect(corbeau).toHaveClass(/saute/);
  await expect(corbeau).not.toHaveClass(/saute/, { timeout: 4000 });

  await page.reload();
  await expect(html).toHaveAttribute("data-palette", "violet");
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".saison")).toHaveCount(0);   // mi-novembre : pas de décoration

  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Revenir aux réglages d'origine" }).click();
  await expect(html).toHaveAttribute("data-palette", "vert");
  await expect(html).not.toHaveAttribute("data-theme", /./);
});

test("Halloween : toiles d'araignée dans les coins, sans gêner les doigts, et désactivables", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T09:00:00"));
  await page.goto("/");
  await expect(page.locator(".saison.halloween .toile")).toHaveCount(2);
  await expect(page.locator("html")).toHaveAttribute("data-saison", "halloween");
  expect(await page.locator(".saison").evaluate(e => getComputedStyle(e).pointerEvents)).toBe("none");
  await page.getByRole("button", { name: "Ajouter des bilans" }).click({ trial: true });   // le bouton reste touchable sous la toile

  // l'araignée remonte quand on la touche, puis redescend
  await page.waitForTimeout(2600);
  await page.locator(".saison .araignee").click({ force: true });   // elle se balance sans arrêt : on touche sans attendre qu'elle s'immobilise
  await expect(page.locator(".saison .araignee .corps")).toHaveClass(/bouge/);
  await expect(page.locator(".saison .araignee .corps")).not.toHaveClass(/bouge/, { timeout: 6000 });
  await expect(page.locator(".saison .chauve")).toHaveCount(1);

  await page.getByRole("button", { name: "Réglages" }).click();
  await choisir(page, "couleur", "rouge");
  await expect(page.locator(".saison .araignee .corps")).toHaveCount(1);   // pas redessinée par un changement de réglage
  await choisir(page, "saisons", false);
  await expect(page.locator(".saison")).toHaveCount(0);
});
