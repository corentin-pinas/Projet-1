import { expect, test, type Browser, type Page } from "@playwright/test";

/* Transcription en direct (1.5.0) : pendant l'enregistrement, la voix part au Whisper du PC par morceaux et le texte
   s'affiche au fil de la dictée. Morceaux raccourcis pour les tests (__MUNINN_DIRECT__) : 0,7 à 1 s au lieu de 30 à 60 s. */
const PC = "http://127.0.0.1:4747", CODE = "essa-ipcm-unin", WHISPER = "http://localhost:4181";
type Indice = { noms: string[]; avant: string } | null;
const recus = async () => (await (await fetch(WHISPER + "/recus")).json()) as Indice[];

async function appareil(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem("liste-patients", "ouverte");
    (globalThis as any).__MUNINN_DIRECT__ = { min: 700, max: 1000, pause: 100, voix: 1 };
  });
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(CODE);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast")).toContainText("Relié au PC");
  await expect(page.locator("#syncvoix")).toContainText("Whisper est prêt sur le PC");
  await page.locator("#etatclose").click();
  return page;
}

test("séance dictée sur la fiche : le texte s'écrit pendant l'enregistrement, Whisper reçoit le nom du patient et la suite", async ({ browser }) => {
  const page = await appareil(browser);
  const avant = (await recus()).length;
  await page.locator("#q").fill("Paul Direct");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.getByRole("button", { name: /Enregistrer ma séance/ }).click();
  await expect(page.locator("#svoix .voix")).toContainText("Enregistrement");
  // le texte arrive pendant que le micro tourne encore
  await expect(page.locator("#svdirect")).toContainText("avec Odile", { timeout: 10_000 });
  await expect(page.locator("#svdirect")).toContainText("suite", { timeout: 10_000 });
  await expect(page.locator("#svoix .voix")).toContainText("Enregistrement");
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator(".seance")).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator(".seance")).toContainText("avec Odile mobilisation passive");
  await expect(page.locator(".seance")).toContainText(/suite \d+ transcrite sur le PC/);

  const indices = (await recus()).slice(avant);
  expect(indices.length).toBeGreaterThanOrEqual(2);
  expect(indices.every(i => i?.noms.some(n => n.startsWith("Paul")))).toBe(true);   // le nom du patient
  expect(indices[0]?.avant).toBe("");                                                  // premier morceau : rien avant
  expect(indices[1]?.avant).toContain("avec Odile mobilisation passive");              // le suivant : la fin du précédent
  await page.context().close();
});

test("dictée groupée : le texte s'écrit pendant l'enregistrement, puis la dictée est remplie sans tout retranscrire", async ({ browser }) => {
  const page = await appareil(browser);
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.getByRole("button", { name: /Enregistrer ma dictée/ }).click();
  await expect(page.locator("#vdirect")).toContainText("suite", { timeout: 10_000 });
  const pendant = (await recus()).length;
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator("#dtexte")).toHaveValue(/^avec Odile mobilisation passive, transcrit sur le PC suite \d+ transcrite sur le PC/, { timeout: 10_000 });
  // à l'arrêt, seul le dernier morceau part au PC (au plus 2 envois de plus), pas tout l'enregistrement
  expect((await recus()).length - pendant).toBeLessThanOrEqual(2);
  await page.context().close();
});

test("un morceau n'arrive pas au PC, même au nouvel essai : tout l'enregistrement est transcrit à la fin, rien n'est perdu", async ({ browser }) => {
  const page = await appareil(browser);
  // le réseau lâche pour les morceaux qui suivent le premier ; l'envoi de tout l'enregistrement, lui, passe
  let coupes = 0;
  await page.route("**/api/voix/transcrire**", route => {
    const indice = new URL(route.request().url()).searchParams.get("indice");
    if (indice && JSON.parse(indice).avant) { coupes++; return route.abort(); }
    return route.continue();
  });
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.getByRole("button", { name: /Enregistrer ma dictée/ }).click();
  await expect(page.locator("#vdirect")).toContainText("avec Odile", { timeout: 10_000 });
  await expect.poll(() => coupes, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Arrêter et transcrire" }).click();
  await expect(page.locator("#dtexte")).toHaveValue("avec Odile mobilisation passive, transcrit sur le PC", { timeout: 10_000 });
  await page.context().close();
});
