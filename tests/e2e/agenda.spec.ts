import { expect, test, type Page } from "@playwright/test";

/* la liste de tous les patients, cachée par défaut, est ouverte pour ces tests */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));

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

test("agenda : semaine en demi-journées, places libres, patient créé et placé, horaires", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-28T09:10:00"));
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Bilan - Marc DUPONT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.getByLabel("Matin").check();
  await page.getByLabel("Bilan (40 min)").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rdv")).toContainText("aujourd'hui matin (bilan)");

  await page.getByRole("button", { name: "Agenda" }).click();
  const mer = page.locator(".jour").nth(2);
  const matin = mer.locator(".ademi").nth(0), aprem = mer.locator(".ademi").nth(1);
  await expect(page.locator(".abar h2")).toHaveText("Semaine du 26 octobre");
  await expect(matin.locator(".rdvb")).toHaveText("Marc D.bilan");
  // horaires par défaut 8 h-12 h (12 places) / 14 h-19 h (15 places) ; un bilan prend deux places
  await expect(matin.locator("h4")).toContainText("1 patient · 10 places");
  await expect(aprem.locator("h4")).toContainText("0 patient · 15 places");
  await expect(page.locator(".jour").nth(0).locator(".ajout")).toHaveCount(0);   // lundi passé : on n'ajoute plus

  // nouveau patient placé l'après-midi
  await aprem.getByRole("button", { name: /Ajouter un patient/ }).click();
  await page.locator("#pq").fill("Paul Garcia");
  await page.getByRole("button", { name: "Nouveau patient « Paul G. » (bilan à venir)" }).click();
  await expect(page.getByRole("status")).toContainText("Paul G. : séance mercredi 28 octobre après-midi. Patient créé");
  await expect(aprem.locator(".rdvb", { hasText: "Paul G." })).toBeVisible();
  await expect(aprem.locator("h4")).toContainText("1 patient · 14 places");

  // un patient existant, déplacé dans la même journée : on demande avant
  await aprem.getByRole("button", { name: /Ajouter un patient/ }).click();
  await page.locator("#pq").fill("marc");
  await page.locator(".presultats .cand", { hasText: "Marc D." }).click();
  await expect(page.locator("dialog.confirm")).toContainText("Marc D. a déjà rendez-vous ce jour-là (matin). Le mettre l'après-midi ?");
  await page.locator("dialog.confirm").getByRole("button", { name: "Déplacer" }).click();
  await expect(aprem.locator(".rdvb", { hasText: "Marc D." })).toBeVisible();
  await expect(matin.locator(".rdvb")).toHaveCount(0);

  // horaires : le vendredi n'est plus travaillé
  await page.getByRole("button", { name: "Mes horaires" }).click();
  await page.locator('.hligne[data-n="5"] [data-travail]').uncheck();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".jour").nth(4).locator(".ademi.ferme")).toHaveCount(2);

  // semaine suivante, puis retour
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(page.locator(".abar h2")).toHaveText("Semaine du 2 novembre");
  await page.getByRole("button", { name: "Cette semaine" }).click();

  // toucher un patient ouvre sa fiche
  await mer.locator(".rdvb", { hasText: "Paul G." }).click();
  await expect(page.locator(".agenda")).toHaveCount(0);
  await expect(page.locator("#main h2")).toHaveText("Paul G.");
  await expect(page.locator(".rdv")).toContainText("aujourd'hui après-midi");
  await expect(page.locator("#list .grp").first()).toHaveText("Aujourd'hui");
});
