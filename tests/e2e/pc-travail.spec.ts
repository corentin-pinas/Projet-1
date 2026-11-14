import { expect, test, type Browser, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/* 1.9.0 (choix de Corentin du 14 novembre 2026) : le PC fait le travail en tâche de fond. Un second PC de test (port 4757)
   connaît l'adresse du serveur de l'appli ; l'IA est le faux Claude Code du serveur, Whisper le faux Whisper. */
const PC = "http://127.0.0.1:4757", CODE_PC = "essa-ipcm-unin", CODE = "code-acces-essai-123";

test.beforeEach(() => { mkdirSync(".faux-claude", { recursive: true }); writeFileSync(".faux-claude/connecte", "1"); });

async function appareil(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  return page;
}
async function relier(page: Page) {
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.locator("#abocode").fill(CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await expect(page.locator("#abostatut")).toContainText("connecté à votre abonnement");
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(CODE_PC);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast").last()).toContainText("Relié au PC");
  await page.locator("#etatclose").click();
}
async function creer(page: Page, nom: string) {
  await page.locator("#q").fill(nom);
  await page.getByRole("button", { name: /Créer le patient/ }).click();
}
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });
async function travauxPC(): Promise<{ type: string; etat: string; appareil?: string }[]> {
  const r = await (await fetch(PC + "/api/sync/changements?depuis=0", { headers: { Authorization: "Bearer " + CODE_PC } })).json();
  return r.changements.find((c: { cle: string }) => c.cle === "parametres/travaux")?.valeur?.travaux ?? [];
}

test("dictée groupée confiée au PC : l'appareil se ferme aussitôt, la dictée est rangée, le récapitulatif s'affiche sur un autre appareil", async ({ browser }) => {
  const tel = await appareil(browser);
  await creer(tel, "Marc Durand");
  await relier(tel);
  await tel.getByRole("button", { name: "Dictée groupée" }).click();
  await tel.locator("#dtexte").fill("Avec Marc, massage de l'épaule et mobilisations douces.");
  await tel.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(tel.locator(".toast").last()).toContainText("Dictée envoyée au PC");
  await expect(tel.locator("#dtexte")).toHaveValue("");
  await tel.context().close();                                  // Corentin range son téléphone : le PC continue seul

  const tablette = await appareil(browser);
  await relier(tablette);
  await expect(item(tablette, "Marc D.")).toHaveCount(1);
  await tablette.getByRole("button", { name: "Dictée groupée" }).click();
  await expect(tablette.locator(".recap")).toContainText("1 séance rangée : Marc D. (rangée par le PC)", { timeout: 30_000 });
  await item(tablette, "Marc D.").click();
  await expect(tablette.locator(".seance")).toContainText("Fait en séance : massage de l'épaule et mobilisations douces.");
  // « Annuler cette dictée » marche aussi pour une dictée rangée par le PC, sur un autre appareil que celui qui l'a dictée
  await tablette.getByRole("button", { name: "Dictée groupée" }).click();
  await tablette.getByRole("button", { name: "Annuler cette dictée" }).click();
  await tablette.locator("dialog.confirm").getByRole("button", { name: "Annuler la dictée" }).click();
  await expect(tablette.locator("#dtexte")).toHaveValue("Avec Marc, massage de l'épaule et mobilisations douces.");
  await expect(item(tablette, "Marc D.")).not.toContainText("séance");
  await tablette.context().close();
});

test("séance tapée sur la fiche : mise au propre par le PC", async ({ browser }) => {
  const page = await appareil(browser);
  await creer(page, "Odile Martin");
  await relier(page);
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("douleur deux sur dix mobilisations");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toContainText("mobilisations passives de l'épaule gauche", { timeout: 30_000 });
  const moi = await page.evaluate(() => new Promise<string>(ok => {
    const r = indexedDB.open("mes-patients");
    r.onsuccess = () => { const g = r.result.transaction("parametres").objectStore("parametres").get("appareil"); g.onsuccess = () => ok(g.result.valeur); };
  }));
  expect((await travauxPC()).filter(t => t.type === "analyse" && t.appareil === moi)).toMatchObject([{ etat: "fini" }]);
  await page.context().close();
});

test("séance dite à la voix sans transcription en direct : l'enregistrement est confié au PC, la séance arrive toute seule", async ({ browser }) => {
  const page = await appareil(browser);
  await creer(page, "Henri Petit");
  await relier(page);
  await page.route(/4757\/api\/voix\/transcrire/, r => r.abort());   // transcription en direct impossible
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("Patient en forme.");
  await page.getByRole("button", { name: /Enregistrer ma séance/ }).click();
  await expect(page.locator(".voix")).toContainText("Enregistrement");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator(".toast").last()).toContainText("Enregistrement envoyé au PC");
  await expect(page.locator("#stext")).toHaveCount(0);           // le formulaire se ferme
  const seance = page.locator(".seance:not(.pcseance)");
  await expect(seance).toContainText("mobilisations passives de l'épaule gauche", { timeout: 30_000 });
  await expect(page.locator(".pcseance")).toHaveCount(0);
  await page.locator("details.orig summary").first().click();
  await expect(page.locator("details.orig").first()).toContainText("Patient en forme.\navec Odile mobilisation passive, transcrit sur le PC");
  await page.context().close();
});
