import { expect, test, type Browser, type Page } from "@playwright/test";

/* Deux appareils (deux navigateurs séparés, chacun avec sa propre base) et le Muninn du PC lancé pour les tests (port 4747). */
const PC = "http://127.0.0.1:4747", CODE = "essa-ipcm-unin";   // le code se tape en minuscules aussi

async function appareil(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  return page;
}

async function relier(page: Page, code = CODE) {
  await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(code);
  await page.getByRole("button", { name: "Relier au PC" }).click();
}

const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });
/* numéro de la dernière modification reçue par le PC */
const revPC = async () => (await (await fetch(PC + "/api/sync/etat", { headers: { Authorization: "Bearer " + CODE } })).json()).rev as number;

test("tablette et PC partagent patients, bilans et séances par le PC", async ({ browser }) => {
  const tablette = await appareil(browser);
  const p = await tablette.context().newPage();
  await p.setContent("<h1>Odile</h1><p>Bilan de test, patiente fictive.</p>");
  const pdf = await p.pdf({ format: "A4" });
  await p.close();

  // la tablette a déjà un patient avec son bilan et une séance avant d'être reliée
  await tablette.locator("#file").setInputFiles([{ name: "Fiche Bilan Épaule - Odile PARTAGE.pdf", mimeType: "application/pdf", buffer: pdf }]);
  await expect(item(tablette, "Odile P.")).toHaveCount(1);
  await tablette.getByRole("button", { name: "Dicter la séance" }).click();
  await tablette.locator("#stext").fill("Mobilisation passive, douleur 4 sur 10.");
  await tablette.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(tablette.locator(".seance")).toHaveCount(1);

  // un mauvais code est refusé
  await relier(tablette, "MAUV-AISC-ODE0");
  await expect(tablette.locator(".toast")).toContainText("refuse le code");
  await expect(tablette.locator("#syncmini")).toBeHidden();

  // relier : tout part vers le PC
  await tablette.locator("#synccode").fill(CODE);
  await tablette.getByRole("button", { name: "Relier au PC" }).click();
  await expect(tablette.locator(".toast")).toContainText("Relié au PC");
  await expect(tablette.locator("#syncetat")).toContainText("Dernier échange");
  await tablette.locator("#etatclose").click();
  await expect(tablette.locator("#syncmini")).toContainText("À jour avec le PC");

  // le PC (un autre appareil, vide) reçoit tout, PDF compris
  const pc = await appareil(browser);
  await expect(pc.locator("#syncmini")).toBeHidden();
  await relier(pc);
  await expect(pc.locator(".toast")).toContainText("Relié au PC");
  await pc.locator("#etatclose").click();
  await item(pc, "Odile P.").click();
  await expect(pc.locator(".seance")).toHaveCount(1);
  await expect(pc.locator(".seance")).toContainText("douleur 4 sur 10");
  await pc.getByRole("button", { name: "Voir le bilan complet" }).click();
  await expect(pc.locator(".viewer canvas")).toHaveCount(1, { timeout: 15_000 });
  await pc.locator("#vclose").click();

  // une séance notée sur le PC part toute seule quelques secondes après, et la tablette la reçoit
  let rev = await revPC();
  await pc.getByRole("button", { name: "Dicter la séance" }).click();
  await pc.locator("#sdate").fill("2026-01-05");
  await pc.locator("#stext").fill("Bilan fait à la maison sur le PC, renforcement.");
  await pc.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(pc.locator(".seance")).toHaveCount(2);
  await expect.poll(revPC, { timeout: 10_000 }).toBeGreaterThan(rev);

  await tablette.locator("#syncmini").click();
  await tablette.getByRole("button", { name: "Échanger maintenant" }).click();
  await expect(tablette.locator(".toast")).toContainText("cet appareil est à jour");
  await tablette.locator("#etatclose").click();
  await item(tablette, "Odile P.").click();
  await expect(tablette.locator(".seance")).toHaveCount(2);
  await expect(tablette.locator(".seances")).toContainText("Bilan fait à la maison sur le PC");

  // un patient supprimé sur la tablette disparaît du PC
  rev = await revPC();
  await tablette.getByRole("button", { name: "Supprimer ce bilan" }).click();
  await tablette.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await expect(item(tablette, "Odile P.")).toHaveCount(0);
  await expect.poll(revPC, { timeout: 10_000 }).toBeGreaterThan(rev);
  await pc.locator("#syncmini").click();
  await pc.getByRole("button", { name: "Échanger maintenant" }).click();
  await pc.locator("#etatclose").click();
  await expect(item(pc, "Odile P.")).toHaveCount(0);

  // délier : l'appareil garde ses données mais n'échange plus
  await pc.locator("#etatbtn").click();
  await pc.getByRole("button", { name: "Délier cet appareil" }).click();
  await pc.locator("dialog.confirm").getByRole("button", { name: "Délier" }).click();
  await expect(pc.locator("#syncetat")).toContainText("pas relié");
  await expect(pc.locator("#syncmini")).toBeHidden();

  await tablette.context().close();
  await pc.context().close();
});

test("dictée à la voix : relié au PC, la voix est transcrite par le Whisper du PC, sans code de l'IA", async ({ browser, request }) => {
  const page = await appareil(browser);
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await expect(page.locator(".dictee textarea")).toBeVisible();
  await expect(page.getByRole("button", { name: /Enregistrer ma dictée/ })).toHaveCount(0);   // ni PC ni serveur : pas de bouton
  await page.locator("#dfermer").click();

  await relier(page);
  await expect(page.locator(".toast")).toContainText("Relié au PC");
  await expect(page.locator("#syncvoix")).toContainText("Whisper est prêt sur le PC");
  await page.locator("#etatclose").click();
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.getByRole("button", { name: /Enregistrer ma dictée/ }).click();
  await expect(page.locator(".voix")).toContainText("Enregistrement");
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator("#dtexte")).toHaveValue("avec Odile mobilisation passive, transcrit sur le PC");
  const recu = await (await request.get("http://localhost:4181/dernier")).json();
  expect(recu).toMatchObject({ pc: true });
  expect(recu.type).toContain("audio/");
  expect(recu.taille).toBeGreaterThan(1000);
  // sans le code du PC, pas de transcription
  expect((await fetch(PC + "/api/voix/transcrire", { method: "POST", body: "x" })).status).toBe(401);
  await page.context().close();
});

test("le PC injoignable : l'appareil le dit et garde tout", async ({ browser }) => {
  const page = await appareil(browser);
  await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill("http://127.0.0.1:4799");
  await page.locator("#synccode").fill(CODE);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast")).toContainText("PC injoignable");
  await expect(page.locator("#syncform")).toBeVisible();
  // la ligne d'installation pour le PC reprend l'adresse de l'appli
  await page.locator("summary", { hasText: "Installer Muninn sur le PC" }).click();
  await expect(page.locator("#synccommande")).toHaveText("irm http://localhost:4173/pc/installer.ps1 | iex");
  await page.context().close();
});

test("le programme d'installation du PC est livré avec la bonne adresse", async ({ request }) => {
  const r = await request.get("/pc/installer.ps1");
  expect(r.ok()).toBe(true);
  const t = await r.text();
  expect(t).toContain('$Adresse = "http://localhost:4173"');
  expect(t).not.toContain("__ADRESSE__");
  expect((await request.get("/pc/muninn-pc.mjs")).ok()).toBe(true);
});
