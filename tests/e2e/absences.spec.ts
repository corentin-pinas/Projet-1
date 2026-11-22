import { expect, test, type Page } from "@playwright/test";

/* Absences (1.11.0, choix de Corentin du 20 novembre 2026) : comptées depuis le 20/11/2026 ; compteur sur la fiche complète
   seulement, absences d'affilée distinguées ; alerte à 3 d'affilée ou 5 en tout (pastille dans Ma journée, « Vu ») ;
   « Erreur : pas de rendez-vous ce jour-là » retire un rendez-vous noté par erreur, sans compter d'absence. */
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });

async function semer(page: Page, magasins: Record<string, unknown[]>) {
  await page.evaluate(async magasins => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(Object.keys(magasins), "readwrite");
    for (const [nom, l] of Object.entries(magasins)) for (const x of l) tx.objectStore(nom).put(x);
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, magasins);
  await page.reload();
}

test("compteur sur la fiche (d'affilée distinguées, anciennes absences pas comptées) ; alerte « souvent absent » dans Ma journée ; « Vu »", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-01T10:00:00"));
  await page.goto("/");
  await semer(page, {
    dossiers: [
      { id: "p", label: "Paul R.", rdvs: [], homonyme: false, cree: "2026-10-01T08:00:00Z", absences: ["2026-11-10", "2026-11-23", "2026-11-25", "2026-11-27"] },
      { id: "l", label: "Lucie M.", rdvs: [], homonyme: false, cree: "2026-10-01T08:00:00Z", absences: ["2026-11-24"] }
    ],
    seances: [{ id: "s1", dossierId: "p", date: "2026-11-21", cree: "2026-11-21T09:00:00Z", contenu: "Mobilisation", ia_ok: true },
      { id: "s2", dossierId: "l", date: "2026-11-21", cree: "2026-11-21T09:00:00Z", contenu: "Mobilisation", ia_ok: true }]
  });
  const puce = page.locator("#abpuce");
  await expect(puce).toHaveText("⚠ 1 patient souvent absent");
  await expect(page.locator(".jcarte")).toHaveCount(0);              // rien sur les petites fiches de Ma journée

  await item(page, "Lucie M.").click();
  await expect(page.locator("#absbadge")).toHaveText("1 absence");     // pas d'alerte : discret
  await expect(page.locator("#absbadge")).not.toHaveClass(/alerte/);

  await item(page, "Paul R.").click();
  const badge = page.locator("#absbadge");
  await expect(badge).toHaveText("⚠ 3 absences, dont 3 d'affilée");     // celle du 10/11 n'est pas comptée
  await expect(badge).toHaveClass(/alerte/);
  await badge.click();
  await expect(page.locator(".absdetail")).toContainText("Absences notées depuis le 20/11/2026 : lun. 23 nov., mer. 25 nov., ven. 27 nov.");
  await expect(page.locator(".absdetail")).toContainText("3 séances manquées d'affilée : à voir avec le patient.");

  await page.getByRole("button", { name: "Ma journée" }).click();
  await puce.click();
  const fenetre = page.locator(".absdlg");
  await expect(fenetre).toContainText("Paul R. 3 absences, dont 3 d'affilée");
  await fenetre.getByRole("button", { name: "Vu" }).click();
  await expect(puce).toHaveCount(0);
});

test("rendez-vous noté par erreur : « Erreur : pas de rendez-vous ce jour-là » le retire, sans absence", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-01T10:00:00"));
  await page.goto("/");
  await semer(page, { dossiers: [{ id: "p", label: "Paul R.", rdvs: [{ d: "2026-11-27", h: "", p: "am" }, { d: "2026-12-04", h: "", p: "am" }], homonyme: false, cree: "2026-10-01T08:00:00Z" }] });
  await item(page, "Paul R.").click();
  const trou = page.locator(".trou", { hasText: "Vendredi 27 novembre" });
  await expect(trou).toContainText("rendez-vous prévu, aucune séance notée.");
  await trou.getByRole("button", { name: "Erreur : pas de rendez-vous ce jour-là" }).click();
  await expect(page.locator(".toast").last()).toContainText("Rendez-vous retiré.");
  await expect(page.locator(".trou")).toHaveCount(0);
  await expect(page.locator("#absbadge")).toHaveCount(0);
  const rdvs = await page.evaluate(() => new Promise<unknown>(ok => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => { const g = r.result.transaction("dossiers").objectStore("dossiers").get("p"); g.onsuccess = () => ok(g.result.rdvs); }; }));
  expect(rdvs).toEqual([{ d: "2026-12-04", h: "", p: "am" }]);             // le rendez-vous à venir reste
});
