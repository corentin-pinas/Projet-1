import { expect, test, type Page } from "@playwright/test";

/* Agenda et patients sans bilan. L'horloge est fixée au mercredi 28 octobre 2026, 9 h 10. */
async function fairePdf(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setContent("<h1>Bilan test</h1>");
  const b = await p.pdf();
  await p.close();
  return b;
}

test("patient déjà en soins : créé sans bilan, séances notées, bilan ajouté plus tard", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await page.locator("#q").fill("Paul Garcia");
  await page.getByRole("button", { name: "Créer le patient « Paul G. » (bilan à venir)" }).click();
  await expect(page.locator("#main h2")).toHaveText("Paul G.");
  await expect(page.locator("#main .meta").first()).toHaveText("Bilan à venir");
  await expect(page.locator("#list .item", { hasText: "Paul G." })).toContainText("Bilan à venir");

  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("mobilisation passive de l'épaule");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);

  // le bilan arrive : il rejoint la fiche, quel que soit le nom du fichier
  await page.getByRole("button", { name: "Ajouter le bilan" }).click();
  await page.locator("#file").setInputFiles([{ name: "scan 12.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator("#main h2")).toHaveText("Paul G.");
  await expect(page.getByRole("button", { name: "Voir le bilan complet" })).toBeVisible();
  await expect(page.locator(".seance")).toHaveCount(1);
  await expect(page.locator("#list .item")).toHaveCount(2);

  // un nom déjà pris est refusé
  await page.locator("#q").fill("Marc Dupont");
  await expect(page.locator("#list .item")).toHaveCount(1);   // Marc D. trouvé : pas de création proposée
});

test("supprimer un patient sans bilan", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await page.locator("#q").fill("Paul G");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Supprimer ce patient" }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "Supprimer le patient" }).click();
  await expect(page.locator("#list .item")).toHaveCount(1);
});

test("agenda : semaine, créneaux libres, patient créé et placé dans un trou, horaires", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T09:10:00"));
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.locator("#rtime").fill("10:00");
  await page.getByLabel("Bilan (40 min)").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rdv")).toContainText("aujourd'hui à 10 h (bilan)");

  await page.getByRole("button", { name: "Agenda" }).click();
  const mer = page.locator(".jour").nth(2);
  await expect(page.locator(".abar h2")).toHaveText("Semaine du 26 octobre");
  await expect(mer.locator(".rdvb")).toContainText("Marc D.10 h · bilan");
  // horaires par défaut 8 h-12 h / 14 h-19 h ; le passé (avant 9 h 10) n'est pas proposé ; le bilan occupe 10 h-10 h 40
  await expect(mer.locator(".libre").first()).toHaveText("9 h 20");
  await expect(mer.locator('.libre[data-min="600"], .libre[data-min="620"]')).toHaveCount(0);
  await expect(mer.locator(".entete")).toContainText("1 rdv · 21 libres");

  // nouveau patient placé dans le trou de 9 h 20
  await mer.locator('.libre[data-min="560"]').click();
  await page.locator("#pq").fill("Paul Garcia");
  await page.getByRole("button", { name: "Nouveau patient « Paul G. » (bilan à venir)" }).click();
  await expect(page.getByRole("status")).toContainText("Paul G. : séance mercredi 28 octobre à 9 h 20. Patient créé");
  await expect(mer.locator(".rdvb", { hasText: "Paul G." })).toContainText("9 h 20");
  await expect(mer.locator(".entete")).toContainText("2 rdv · 20 libres");

  // un patient existant, déplacé dans la même journée : on demande avant
  await mer.locator('.libre[data-min="840"]').click();
  await page.locator("#pq").fill("marc");
  await page.locator(".presultats .cand", { hasText: "Marc D." }).click();
  await expect(page.locator("dialog.confirm")).toContainText("Marc D. a déjà rendez-vous ce jour-là à 10 h. Le déplacer à 14 h ?");
  await page.locator("dialog.confirm").getByRole("button", { name: "Déplacer" }).click();
  await expect(mer.locator(".rdvb", { hasText: "Marc D." })).toContainText("14 h");

  // horaires : le vendredi n'est plus travaillé
  await page.getByRole("button", { name: "Mes horaires" }).click();
  await page.locator('.hligne[data-n="5"] [data-travail]').uncheck();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".jour").nth(4).locator(".libre")).toHaveCount(0);

  // semaine suivante, puis retour
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(page.locator(".abar h2")).toHaveText("Semaine du 2 novembre");
  await page.getByRole("button", { name: "Cette semaine" }).click();

  // toucher un patient ouvre sa fiche
  await mer.locator(".rdvb", { hasText: "Paul G." }).click();
  await expect(page.locator(".agenda")).toHaveCount(0);
  await expect(page.locator("#main h2")).toHaveText("Paul G.");
  await expect(page.locator(".rdv")).toContainText("aujourd'hui à 9 h 20");
  await expect(page.locator("#list .grp").first()).toHaveText("Aujourd'hui");
});
