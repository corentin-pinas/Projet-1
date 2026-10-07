import { expect, test, type Page } from "@playwright/test";

/* Un vrai petit PDF, fabriqué par le navigateur de test. */
async function fairePdf(page: Page, texte: string): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setContent(`<h1>${texte}</h1><p>Bilan de test, patient fictif.</p>`);
  const buf = await p.pdf({ format: "A4" });
  await p.close();
  return buf;
}

async function deposer(page: Page, fichiers: { name: string; buffer: Buffer; mimeType: string }[]) {
  await page.locator("#file").setInputFiles(fichiers);
}

const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });

test("ajouter un bilan, dicter une séance, poser un rendez-vous, puis supprimer", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#list")).toContainText("Aucun bilan");

  await deposer(page, [{ name: "Fiche Bilan Épaule - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page, "Marc") }]);
  await expect(page.getByRole("status")).toContainText("Bilan ajouté");
  await expect(item(page, "Marc D.")).toContainText("En attente de résumé");
  await expect(page.locator("#main h2")).toHaveText("Marc D.");
  await expect(page.locator(".wait")).toContainText("réglez l'IA");

  // le bilan complet s'affiche, page par page
  await page.getByRole("button", { name: "Voir le bilan complet" }).click();
  await expect(page.locator(".viewer canvas")).toHaveCount(1, { timeout: 15_000 });
  await page.getByRole("button", { name: "Fermer" }).click();

  // séance dictée : le « À venir » apparaît en haut de la fiche
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("douleur 3 sur 10, renforcement rotateurs externes. Pour la prochaine séance tester la force en rotation externe");
  await expect(page.locator("#avprev")).toContainText("Tester la force en rotation externe");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".avenir")).toContainText("Tester la force en rotation externe");
  await expect(page.locator(".seance")).toHaveCount(1);
  await expect(item(page, "Marc D.")).toContainText("1 séance");

  // rendez-vous aujourd'hui : le patient passe en tête, avec l'heure
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.locator("#rtime").fill("08:30");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rdv")).toContainText("aujourd'hui à 8 h 30");
  await expect(page.locator("#list .grp").first()).toHaveText("Aujourd'hui");
  await expect(item(page, "Marc D.").locator(".hr")).toHaveText("8 h 30");

  // les données restent après fermeture et réouverture
  await page.reload();
  await item(page, "Marc D.").click();
  await expect(page.locator(".seance")).toHaveCount(1);

  // suppression du seul bilan : confirmation, puis le patient disparaît
  await page.getByRole("button", { name: "Supprimer ce bilan" }).click();
  await expect(page.getByRole("dialog")).toContainText("C'est son seul bilan");
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(page.locator("#list")).toContainText("Aucun bilan");
});

test("deux patients au même prénom et même initiale restent deux dossiers", async ({ page }) => {
  await page.goto("/");
  await deposer(page, [
    { name: "Bilan - Sylvie FAURE.pdf", mimeType: "application/pdf", buffer: await fairePdf(page, "S1") },
    { name: "Bilan coude - Sylvie FABRE.pdf", mimeType: "application/pdf", buffer: await fairePdf(page, "S2") }
  ]);
  await expect(page.getByRole("status")).toContainText("2 bilans ajoutés");
  await expect(item(page, "Sylvie F.")).toHaveCount(2);
});

test("des photos choisies ensemble forment un seul bilan", async ({ page }) => {
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await deposer(page, [
    { name: "Lucie BERNARD p1.png", mimeType: "image/png", buffer: png },
    { name: "Lucie BERNARD p2.png", mimeType: "image/png", buffer: png }
  ]);
  await expect(item(page, "Lucie B.")).toHaveCount(1);
  await page.getByRole("button", { name: "Voir le bilan complet" }).click();
  await expect(page.locator(".viewer img")).toHaveCount(2);
});

test("la recherche filtre la liste", async ({ page }) => {
  await page.goto("/");
  await deposer(page, [
    { name: "Bilan - Paul ROUX.pdf", mimeType: "application/pdf", buffer: await fairePdf(page, "P") },
    { name: "Bilan - Anne TISSOT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page, "A") }
  ]);
  await page.locator("#q").fill("paul");
  await expect(page.locator("#list .item")).toHaveCount(1);
  await expect(page.locator("#list .item")).toContainText("Paul R.");
});
