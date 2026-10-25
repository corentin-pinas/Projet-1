import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("un bilan supprimé par erreur revient grâce à la copie du jour, et le retour peut s'annuler", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-12T08:00:00"));
  await page.goto("/");
  const p = await page.context().newPage();
  await p.setContent("<h1>Marc</h1><p>Bilan de test, patient fictif.</p>");
  const pdf = await p.pdf({ format: "A4" });
  await p.close();
  await page.locator("#file").setInputFiles([{ name: "Fiche Bilan Épaule - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: pdf }]);
  await expect(page.locator("#list .item", { hasText: "Marc D." })).toHaveCount(1);

  // le lendemain : la copie se fait à l'ouverture
  await page.clock.setFixedTime(new Date("2026-10-13T08:00:00"));
  await page.reload();
  await page.locator("#list .item", { hasText: "Marc D." }).click();
  await page.getByRole("button", { name: "Supprimer ce bilan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.locator("#list")).toContainText("Aucun bilan");

  await page.locator("#etatbtn").click();
  await expect(page.locator("#copiesetat")).toContainText("1 copie gardée");
  await expect(page.locator("#copies li")).toContainText(/mardi 13 octobre/i);
  await expect(page.locator("#copies li")).toContainText("1 patient, 0 séance");
  await page.getByRole("button", { name: "Revenir à cette copie" }).click();
  await expect(page.locator("dialog.confirm")).toContainText("vous pourrez annuler ce retour");
  await page.locator("dialog.confirm").getByRole("button", { name: "Revenir à cette copie" }).click();
  await expect(page.locator(".toast")).toContainText("Données remises au mardi 13 octobre");
  await expect(page.locator("#copies li.avant")).toContainText("Avant le dernier retour en arrière");
  await page.locator("#etatclose").click();

  // le bilan est revenu, PDF compris
  await page.locator("#list .item", { hasText: "Marc D." }).click();
  await page.getByRole("button", { name: "Voir le bilan complet" }).click();
  await expect(page.locator(".viewer canvas")).toHaveCount(1, { timeout: 15_000 });
  await page.locator("#vclose").click();

  // annuler le retour en arrière
  await page.locator("#etatbtn").click();
  await page.getByRole("button", { name: "Annuler le retour en arrière" }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler le retour" }).click();
  await expect(page.locator("#copies li.avant")).toHaveCount(0);
  await page.locator("#etatclose").click();
  await expect(page.locator("#list")).toContainText("Aucun bilan");
});

test("copie hors de Chrome : fichier protégé par mot de passe, restauré sur une tablette neuve", async ({ page, browser }, info) => {
  await page.goto("/");
  const p = await page.context().newPage();
  await p.setContent("<h1>Lucie</h1><p>Bilan de test, patient fictif.</p>");
  const pdf = await p.pdf({ format: "A4" });
  await p.close();
  await page.locator("#file").setInputFiles([{ name: "Bilan - Lucie BERNARD.pdf", mimeType: "application/pdf", buffer: pdf }]);
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("mobilisation passive, douleur 2 sur 10");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);

  await page.locator("#etatbtn").click();
  await expect(page.locator('.verif[data-id="copie-externe"]')).not.toHaveClass(/ok/);
  await expect(page.locator('.verif[data-id="copie-externe"]')).toContainText("Pas encore faite");

  // première fois : choix du mot de passe
  await page.getByRole("button", { name: "Copier hors de Chrome" }).click();
  await page.locator("#mdp1").fill("cabinet-2026");
  await page.locator("#mdp2").fill("cabinet-2027");
  await page.getByRole("button", { name: "Enregistrer et copier" }).click();
  await expect(page.locator(".toast")).toContainText("ne sont pas les mêmes");
  await page.locator("#mdp2").fill("cabinet-2026");
  const telechargement = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer et copier" }).click();
  const d = await telechargement;
  expect(d.suggestedFilename()).toMatch(/^mes-patients-\d{4}-\d{2}-\d{2}\.sauvegarde$/);
  const chemin = info.outputPath("copie.sauvegarde");
  await d.saveAs(chemin);
  await expect(page.locator(".toast")).toContainText("Téléchargements");
  await expect(page.locator('.verif[data-id="copie-externe"]')).toHaveClass(/ok/);
  await expect(page.locator("#extetat")).toContainText("aujourd'hui");

  // la deuxième copie se fait d'un seul geste : le mot de passe est retenu
  const deuxieme = page.waitForEvent("download");
  await page.getByRole("button", { name: "Copier hors de Chrome" }).click();
  await deuxieme;
  await expect(page.locator("#mdpform")).toBeHidden();

  // tablette neuve
  const neuve = await (await browser.newContext()).newPage();
  await neuve.goto("/");
  await expect(neuve.locator("#list")).toContainText("Aucun bilan");
  await neuve.locator("#etatbtn").click();
  // le fichier est passé en mémoire : par son chemin, l'outil de test ne le transmet pas à un second contexte
  await neuve.locator("#extfichier").setInputFiles({ name: "mes-patients.sauvegarde", mimeType: "application/octet-stream", buffer: readFileSync(chemin) });
  await expect(neuve.locator("#restform")).toBeVisible();
  await neuve.locator("#restmdp").fill("pas le bon");
  await neuve.getByRole("button", { name: "Ouvrir la copie" }).click();
  await expect(neuve.locator(".toast")).toContainText("Mot de passe incorrect");
  await neuve.locator("#restmdp").fill("cabinet-2026");
  await neuve.getByRole("button", { name: "Ouvrir la copie" }).click();
  await expect(neuve.locator("dialog.confirm")).toContainText("1 patient, 1 séance");
  await neuve.locator("dialog.confirm").getByRole("button", { name: "Restaurer cette copie" }).click();
  await expect(neuve.locator(".toast")).toContainText("restaurée");
  await neuve.locator("#etatclose").click();
  await neuve.locator("#list .item", { hasText: "Lucie B." }).click();
  await expect(neuve.locator(".seance")).toHaveCount(1);
  await neuve.getByRole("button", { name: "Voir le bilan complet" }).click();
  await expect(neuve.locator(".viewer canvas")).toHaveCount(1, { timeout: 15_000 });
});
