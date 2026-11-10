import { expect, test, type Page } from "@playwright/test";

/* 1.5.6 (choix de Corentin du 8 nov.) : fiche en plein écran sur le téléphone, retour en haut de l'accueil
   (bouton « Ma journée », retour d'Android, geste de l'iPhone) ; jour sans rendez-vous → prochaine journée avec patients. */

async function patient(page: Page, nom: string, jour: string) {
  await page.locator("#q").fill(nom);
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.locator("#rdate").fill(jour);
  await page.getByLabel("Matin").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
}

test("téléphone : la fiche prend tout l'écran, « retour » ramène en haut de l'accueil", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T09:10:00"));
  await page.goto("/");
  for (const n of ["Paul Garcia", "Lucie Martin", "Marc Dupont", "Rose Fontaine"]) await patient(page, n, "2026-10-29");
  await page.getByRole("button", { name: "Ma journée" }).click();
  await page.setViewportSize({ width: 390, height: 844 });   // téléphone
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
  await expect(page.locator(".side")).toBeVisible();

  // une fiche en bas de l'accueil : elle s'ouvre seule, en haut de l'écran
  await page.locator(".jcarte").last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.locator(".jcarte").last().click();
  await expect(page.locator("#main h2")).toHaveText(/\. ?$/);
  await expect(page.locator(".side")).toBeHidden();
  expect(await page.evaluate(() => scrollY)).toBe(0);

  // retour du téléphone : l'accueil, tout en haut
  await page.evaluate(() => scrollTo(0, 400));
  await page.goBack();
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
  await expect(page.locator(".side")).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page).toHaveURL(/localhost:\d+\/$/);   // toujours dans Muninn

  // bouton « ← Ma journée » : même chose ; un second « retour » ne rouvre rien
  await page.locator(".jcarte").first().click();
  await expect(page.locator(".side")).toBeHidden();
  await page.locator("#majournee").click();
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
  expect(await page.evaluate(() => history.state?.muninn ?? null)).toBeNull();
});

test("retour avec une séance en cours de frappe : question, et rien n'est perdu si on reste", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T09:10:00"));
  await page.goto("/");
  await patient(page, "Paul Garcia", "2026-10-29");
  await page.getByRole("button", { name: "Ma journée" }).click();
  await page.locator(".jcarte").first().click();
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("massage du trapèze");
  await page.goBack();
  await expect(page.locator("dialog.confirm")).toContainText("n'est pas enregistrée");
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler" }).click();
  await expect(page.locator("#main h2")).toHaveText("Paul G.");
  await expect(page.locator("#stext")).toHaveValue("massage du trapèze");
  // tablette : le retour d'Android referme la fiche une fois la question acceptée
  await page.goBack();
  await page.locator("dialog.confirm").getByRole("button", { name: "Quitter sans enregistrer" }).click();
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
});

test("dimanche sans patients : Muninn montre lundi ; samedi, le 3e bouton propose lundi", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-07T10:00:00"));   // samedi
  await page.goto("/");
  await patient(page, "Paul Garcia", "2026-11-09");                 // lundi
  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(page.locator(".jsaut")).toHaveText("Pas de rendez-vous aujourd'hui : voici lundi.");
  await expect(page.locator(".jchoix button")).toHaveText(["Matin 0", "Après-midi 0", "Lundi 1"]);
  await expect(page.locator(".jcarte")).toContainText("Paul G.");
  await expect(page.locator("#main .meta").first()).toContainText("Lundi 9 novembre");
  // le matin vide, choisi à la main : plus de saut, bouton « Voir lundi »
  await page.getByRole("button", { name: /^Matin/ }).click();
  await expect(page.locator(".jsaut")).toHaveCount(0);
  await expect(page.locator(".jvide")).toContainText("Aucun rendez-vous noté ce matin.");
  await expect(page.locator(".jvide").getByRole("button", { name: "Voir lundi" })).toBeVisible();
});

test("le soir à partir de 20 h : Muninn montre la prochaine journée avec patients", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-10T20:15:00"));   // mardi soir
  await page.goto("/");
  await patient(page, "Paul Garcia", "2026-11-10");                 // vu aujourd'hui
  await patient(page, "Lucie Martin", "2026-11-11");                // demain
  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(page.locator(".jsaut")).toHaveText("Journée terminée : voici demain.");
  await expect(page.locator(".jchoix button")).toHaveText(["Matin 1", "Après-midi 0", "Demain 1"]);
  await expect(page.locator(".jcarte")).toContainText("Lucie M.");
  // la journée d'aujourd'hui reste à un toucher
  await page.getByRole("button", { name: /^Matin/ }).click();
  await expect(page.locator(".jcarte")).toContainText("Paul G.");
});
