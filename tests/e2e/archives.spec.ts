import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/* Archivage des patients (1.5.2, choix de Corentin du 8 novembre 2026) : fin de traitement = dossier archivé,
   caché de la liste mais retrouvé par la recherche ; alerte « sans rendez-vous » ; dossier en PDF depuis les Réglages. */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });

test("fin de traitement : le patient est archivé, caché de la liste, retrouvé par la recherche sous « Archivés », puis rouvert", async ({ page }) => {
  await page.goto("/");
  for (const [n, l] of [["Lucie Martin", "Lucie M."], ["Lucien Mauve", "Lucien M."]]) {
    await page.locator("#q").fill(n);
    await page.getByRole("button", { name: /Créer le patient/ }).click();
    await expect(page.locator("#main h2").first()).toContainText(l);   // créé et ouvert avant le suivant
  }
  await item(page, "Lucie M.").click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Dernière séance, mobilisation passive.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await page.locator(".question-rdv").getByRole("button", { name: "Fin de traitement" }).click();
  await expect(page.locator(".rdv")).toContainText("Dossier archivé : fin de traitement le");

  await page.locator("#q").fill("");
  await page.locator("#q").dispatchEvent("input");
  await expect(item(page, "Lucien M.")).toBeVisible();
  await expect(item(page, "Lucie M.")).toHaveCount(0);           // caché de la liste
  await page.locator("#q").fill("Luc");
  await expect(page.locator("#list .grp.archives")).toHaveText("Archivés");
  const items = page.locator("#list .item");
  await expect(items.nth(0)).toContainText("Lucien M.");           // en soins d'abord
  await expect(items.nth(1)).toContainText("Lucie M.");            // puis les archivés
  await expect(items.nth(1)).toContainText("fin le");

  await items.nth(1).click();
  await page.getByRole("button", { name: "Rouvrir le dossier" }).click();
  await expect(page.locator(".toast")).toContainText("Dossier rouvert");
  await page.locator("#q").fill("");
  await page.locator("#q").dispatchEvent("input");
  await expect(item(page, "Lucie M.")).toBeVisible();
});

test("créer un patient au nom d'un patient archivé propose de rouvrir son dossier", async ({ page }) => {
  await page.goto("/");
  await page.locator("#q").fill("Marc Retour");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Fin de prise en charge.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await page.locator(".question-rdv").getByRole("button", { name: "Fin de traitement" }).click();
  await expect(page.locator(".rdv")).toContainText("Dossier archivé");
  await page.locator("#q").fill("Marc Retour");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await expect(page.locator("dialog.confirm")).toContainText("a un dossier archivé");
  await page.locator("dialog.confirm").getByRole("button", { name: "Rouvrir le dossier" }).click();
  await expect(page.locator(".toast")).toContainText("Dossier rouvert");
  await expect(page.locator(".rdv")).not.toContainText("Dossier archivé");
});

test("Ma journée : un patient sans rien depuis plus de 30 jours est signalé ; « Fin de traitement » l'archive", async ({ page }) => {
  await page.goto("/");
  await page.locator("#q").fill("Paul Oubli");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  // dossier créé il y a 40 jours (on vieillit sa date de création dans la base de la page)
  await page.evaluate(async () => {
    const vieux = new Date(Date.now() - 40 * 864e5).toISOString();
    await new Promise<void>((ok, ko) => {
      const r = indexedDB.open("mes-patients");
      r.onsuccess = () => {
        const tx = r.result.transaction("dossiers", "readwrite"), st = tx.objectStore("dossiers");
        st.getAll().onsuccess = e => { for (const d of (e.target as IDBRequest).result) st.put({ ...d, cree: vieux }); };
        tx.oncomplete = () => { r.result.close(); ok(); }; tx.onerror = () => ko(tx.error);
      };
    });
  });
  await page.reload();
  const alerte = page.locator(".sansrdv");
  await expect(alerte).toContainText("À vérifier : un patient sans rendez-vous");
  await expect(alerte).toContainText("Paul O.");
  await expect(alerte).toContainText("Oubli de reprendre rendez-vous, ou fin de traitement ?");
  await alerte.getByRole("button", { name: "Fin de traitement" }).click();
  await expect(page.locator(".toast")).toContainText("Dossier archivé");
  await expect(page.locator(".sansrdv")).toHaveCount(0);
  await expect(item(page, "Paul O.")).toHaveCount(0);
});

test("Réglages : le dossier d'un patient (archivé compris) en PDF pour un contrôle", async ({ page }) => {
  await page.goto("/");
  await page.locator("#q").fill("Jeanne Controle");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("Mobilisation passive, douleur 4 sur 10.");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await page.locator(".question-rdv").getByRole("button", { name: "Fin de traitement" }).click();
  await page.locator("#regbtn").click();
  await expect(page.locator("#regpatient")).toContainText("Jeanne C. (archivé, fin le");
  const telechargement = page.waitForEvent("download");
  await page.locator("#regpdf").click();
  const f = await telechargement;
  expect(f.suggestedFilename()).toMatch(/^Dossier Jeanne C\. .*\.pdf$/);
  const pdf = readFileSync(await f.path());
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  await expect(page.locator(".toast")).toContainText("Dossier de Jeanne C. enregistré");
});

test("« dernière séance » dite dans la note : l'IA le repère, la fin est notée et le dossier archivé", async ({ page }) => {
  await page.route("https://api.anthropic.com/**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { id: "claude-sonnet-5-5", type: "model", display_name: "x" } });
    return route.fulfill({ json: { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
      content: [{ type: "text", text: JSON.stringify({ propre: "Fait en séance : mobilisation passive.\nAutres notes : dernière séance.", resume: null, bref: "Mobilisation passive.", rdv_date: null, rdv_heure: null, rdv_demi: null, fin_traitement: true }) }] } });
  });
  await page.goto("/");
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();
  await page.locator("#q").fill("Rose Fontaine");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("mobilisation passive, c'est la dernière séance");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".toast")).toContainText("Fin de traitement notée pour Rose F. : dossier archivé");
  await expect(page.locator(".rdv")).toContainText("Dossier archivé");
  await expect(page.locator(".question-rdv")).toHaveCount(0);
});
