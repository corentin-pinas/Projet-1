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
