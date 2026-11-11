import { expect, test, type Browser, type Page } from "@playwright/test";

/* 1.7.0 (choix de Corentin du 11 novembre 2026) : un appareil qui n'arrive pas à partager le dit (bandeau) ; état de la mise à jour automatique du PC. */
const PC = "http://127.0.0.1:4747", CODE = "essa-ipcm-unin";

async function nouvellePage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  return page;
}

test("PC injoignable : bandeau après 30 minutes d'attente, « Réessayer » partage et le fait disparaître ; état de la mise à jour du PC", async ({ browser }) => {
  const page = await nouvellePage(browser);
  await page.locator("#q").fill("Paul Joint");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(CODE);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast")).toContainText("Relié au PC");
  // le PC de test n'a pas de lanceur : la mise à jour automatique n'est pas encore installée
  await expect(page.locator("#syncmajpc")).toContainText("pas encore installée");
  await page.locator("#etatclose").click();

  // le PC devient injoignable (en veille) ; un changement est fait ici
  await page.route(PC + "/**", r => r.abort());
  await page.getByRole("button", { name: "Ajouter une séance" }).click();
  await page.locator("#stext").fill("Mobilisation passive.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator("#syncmini")).toContainText("PC pas joint");
  await expect(page.locator("#alertesync")).toBeHidden();             // moins de 30 minutes : pas encore de bandeau

  // 40 minutes plus tard (heure du changement reculée), nouvel essai : le bandeau apparaît
  await page.evaluate(() => localStorage.setItem("partage-attente", new Date(Date.now() - 40 * 60_000).toISOString()));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator("#alertesync")).toContainText("pas encore partagés avec le PC (depuis 40 min)");
  await expect(page.locator("#alertesync")).toContainText("Tailscale est-il actif");

  // le PC revient : « Réessayer » partage, le bandeau disparaît
  await page.unroute(PC + "/**");
  await page.locator("#alertesyncessai").click();
  await expect(page.locator(".toast")).toContainText("tout est partagé");
  await expect(page.locator("#alertesync")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("partage-attente"))).toBeNull();
  await page.context().close();
});
