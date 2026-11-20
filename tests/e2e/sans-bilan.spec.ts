import { expect, test, type Page } from "@playwright/test";

/* Alerte « bilan pas encore ajouté » (1.10.0, choix de Corentin du 20 novembre 2026) : dans Ma journée, 7 jours après la
   création du dossier ou dès la 2e séance ; « Ajouter le bilan », « Plus tard » (7 jours), « Pas de bilan » (plus jamais). */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });

async function patientAvecSeances(page: Page, nom: string, label: string, n: number) {
  await page.locator("#q").fill(nom);
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await expect(page.locator("#main h2").first()).toContainText(label);
  for (let i = 0; i < n; i++) {
    await page.getByRole("button", { name: "Ajouter une séance" }).click();
    await page.locator("#stext").fill("Mobilisation " + (i + 1));
    await page.getByRole("button", { name: "Enregistrer la séance" }).click();
    await expect(page.locator(".seance")).toHaveCount(i + 1);
  }
}
const journee = async (page: Page) => {
  const bouton = page.getByRole("button", { name: "Ma journée" });
  if (await bouton.count()) await bouton.click();   // depuis une fiche ; à l'ouverture, Ma journée est déjà là
  await expect(page.locator("#main h2").last()).toHaveText("Ma journée");
};

test("dès la 2e séance sans bilan : alerte dans Ma journée ; « Ajouter le bilan », « Plus tard », « Pas de bilan »", async ({ page }) => {
  await page.goto("/");
  await patientAvecSeances(page, "Anne Leroy", "Anne L.", 2);
  await patientAvecSeances(page, "Bruno Petit", "Bruno P.", 2);
  await patientAvecSeances(page, "Chloé Roux", "Chloé R.", 2);
  await patientAvecSeances(page, "Denis Vidal", "Denis V.", 1);     // une seule séance, créé aujourd'hui : pas encore
  await journee(page);
  const alerte = page.locator(".sansbilan");
  await expect(alerte.locator("h3")).toHaveText("À vérifier : 3 bilans pas encore ajoutés");
  await expect(alerte).toContainText("Anne L. : dossier créé le");
  await expect(alerte).toContainText("2 séances, toujours sans bilan.");
  await expect(alerte).not.toContainText("Denis V.");

  // « Ajouter le bilan » : le choix du fichier s'ouvre, le bilan rejoint le dossier
  const choix = page.waitForEvent("filechooser");
  await alerte.locator("[data-sb]", { hasText: "Anne L." }).getByRole("button", { name: "Ajouter le bilan" }).click();
  await (await choix).setFiles([{ name: "Bilan épaule.png", mimeType: "image/png", buffer: png }]);
  await expect(item(page, "Anne L.")).not.toContainText("Bilan à venir");
  await journee(page);
  await expect(alerte.locator("h3")).toHaveText("À vérifier : 2 bilans pas encore ajoutés");

  await alerte.locator("[data-sb]", { hasText: "Bruno P." }).getByRole("button", { name: "Plus tard" }).click();
  await expect(page.locator(".toast").last()).toContainText("dans 7 jours");
  await alerte.locator("[data-sb]", { hasText: "Chloé R." }).getByRole("button", { name: "Pas de bilan" }).click();
  await expect(page.locator(".sansbilan")).toHaveCount(0);

  // 8 jours plus tard : Bruno revient (Plus tard), Denis aussi (7 jours après sa création) ; Chloé jamais
  await page.clock.install({ time: new Date(Date.now() + 8 * 864e5) });
  await page.reload();
  await journee(page);
  await expect(alerte.locator("h3")).toHaveText("À vérifier : 2 bilans pas encore ajoutés");
  await expect(alerte).toContainText("Bruno P.");
  await expect(alerte).toContainText("Denis V. : dossier créé le");
  await expect(alerte).not.toContainText("Chloé R.");
});
