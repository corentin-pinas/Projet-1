import { expect, test } from "@playwright/test";

/* « Ma journée » : écran d'accueil. L'horloge est fixée au jeudi 29 octobre 2026, 9 h 10. */
test("ma journée : patients du jour, matin puis après-midi, prévu, séance d'avant, retour depuis une fiche", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T09:10:00"));
  await page.goto("/");
  const p = await page.context().newPage();
  await p.setContent("<h1>Bilan test</h1>");
  const pdf = await p.pdf();
  await p.close();
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: pdf }]);   // patient sans rendez-vous
  await expect(page.locator("#main h2")).toHaveText("Marc D.");

  // deux patients sans bilan, avec un rendez-vous aujourd'hui
  for (const [nom, demi] of [["Paul Garcia", "Après-midi"], ["Lucie Martin", "Matin"]]) {
    await page.locator("#q").fill(nom);
    await page.getByRole("button", { name: /Créer le patient/ }).click();
    await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
    await page.getByLabel(demi).check();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await expect(page.locator(".rdv")).toContainText("aujourd'hui");
  }
  // Paul : une séance la semaine dernière, avec ce qui est prévu pour la suite
  await page.locator("#list .item", { hasText: "Paul G." }).click();
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#sdate").fill("2026-10-22");
  await page.locator("#stext").fill("douleur 3 sur 10, pendulaires. Pour la prochaine séance tester la force en rotation externe");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);

  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
  await expect(page.locator("#main .meta").first()).toContainText("Jeudi 29 octobre · 2 patients · 0 séance notée");
  const cartes = page.locator(".jcarte");
  await expect(cartes).toHaveCount(2);
  await expect(page.locator(".jdemi")).toHaveText(["Matin 1 patient", "Après-midi 1 patient"]);
  await expect(cartes.nth(0)).toContainText("Lucie M.");
  await expect(cartes.nth(1)).toContainText("Prévu : Tester la force en rotation externe");
  await expect(cartes.nth(1)).toContainText("Séance du 22/10 : douleur 3 sur 10, pendulaires.");

  // toucher une fiche ouvre le dossier ; la séance du jour la marque comme notée
  await cartes.nth(0).click();
  await expect(page.locator("#main h2")).toHaveText("Lucie M.");
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("massage du trapèze");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);
  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(cartes.nth(0)).toHaveClass(/faite/);
  await expect(cartes.nth(0)).toContainText("Séance notée : massage du trapèze");
  await expect(page.locator("#main .meta").first()).toContainText("1 séance notée");

  // demain : rien de noté
  await page.getByRole("button", { name: "Demain" }).click();
  await expect(page.locator(".jvide")).toContainText("Aucun rendez-vous noté demain.");
});
