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
  await page.locator("#q").fill("Paul");                         // la recherche affiche la liste
  await page.locator("#list .item", { hasText: "Paul G." }).click();
  await page.locator("#q").fill("");
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#sdate").fill("2026-10-22");
  await page.locator("#stext").fill("douleur 3 sur 10, pendulaires. Pour la prochaine séance tester la force en rotation externe");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);

  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(page.locator("#main h2")).toHaveText("Ma journée");
  // 9 h 10 : le matin est affiché d'abord
  await expect(page.locator("#main .meta").first()).toContainText("Jeudi 29 octobre · matin · 1 patient · 0 séance notée");
  await expect(page.locator(".jchoix button")).toHaveText(["Matin 1", "Après-midi 1", "Demain 0"]);
  const cartes = page.locator(".jcarte");
  await expect(cartes).toHaveCount(1);
  await expect(cartes.nth(0)).toContainText("Lucie M.");
  // l'après-midi : Paul, avec ce qui est prévu et la séance d'avant
  await page.getByRole("button", { name: /Après-midi/ }).click();
  await expect(cartes).toHaveCount(1);
  await expect(cartes.nth(0)).toContainText("Prévu : Tester la force en rotation externe");
  await expect(cartes.nth(0)).toContainText("Séance du 22/10 : douleur 3 sur 10, pendulaires.");
  await page.getByRole("button", { name: /Matin/ }).click();

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
  await page.getByRole("button", { name: /Demain/ }).click();
  await expect(page.locator(".jvide")).toContainText("Aucun rendez-vous noté demain.");
});

test("accueil : la liste de tous les patients est cachée derrière un bouton, la recherche l'affiche ; le matin vide montre l'après-midi", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-29T09:10:00"));
  await page.goto("/");
  await expect(page.locator("#list")).toBeHidden();
  // premier patient, créé depuis la recherche
  await page.locator("#q").fill("Paul Garcia");
  await expect(page.locator("#list")).toBeVisible();
  await page.getByRole("button", { name: "Créer le patient « Paul G. » (bilan à venir)" }).click();
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.getByLabel("Après-midi").check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator("#list")).toBeHidden();                       // recherche vidée : la liste se range

  await page.getByRole("button", { name: "Liste des patients" }).click();
  await expect(page.locator("#list .item")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("#list")).toBeVisible();                      // restée ouverte
  await page.getByRole("button", { name: "Masquer la liste" }).click();
  await expect(page.locator("#list")).toBeHidden();

  // rien le matin : l'après-midi s'affiche directement
  await expect(page.locator("#main .meta").first()).toContainText("après-midi · 1 patient");
  await expect(page.locator(".jcarte")).toContainText("Paul G.");
});
