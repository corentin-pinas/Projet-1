import { expect, test, type Page } from "@playwright/test";

/* 2.1.0 (choix de Corentin du 20 au 22 novembre 2026) : carte du corps sur planches réalistes, zones touchées,
   bulle « Enlever / Garder », anciennes zones avec « Remettre », objectifs ajoutés par la dictée avec case « Atteint ». */

async function semer(page: Page) {
  const cree = "2026-10-30T09:00:00.000Z";
  const z = (structure: string, cote: string, cat: string, nom: string) => ({ id: `${structure}|${cote}|${cat}`, structure, cote, cat, nom, depuis: "2026-10-30", source: "bilan", maj: cree });
  const magasins = {
    dossiers: [{ id: "paul", label: "Paul R.", rdvs: [{ d: "2026-11-23", h: "", p: "am" }], homonyme: false, cree,
      zones: [z("deltoide_post", "d", "pain", "Deltoïde droit, faisceau postérieur"), z("trapeze_sup", "d", "raide", "Trapèze supérieur droit")],
      objectifs_dictes: [{ t: "Ranger une assiette en hauteur sans douleur", date: "2026-11-19" }] }],
    bilans: [{ id: "b1", dossierId: "paul", fichier: "Bilan - Paul R", fichiers: [], ajoute: cree, valides: [], corrections: [],
      resume: { region: "Épaule droite", date_bilan: "30/10/2026", age: 54, coup_oeil: "Coiffe.", chiffres: [{ label: "EVA", valeur: "8/10" }], objectifs: ["Jouer 1 h au tennis sans douleur"], sections: [], a_verifier: [] } }],
    seances: [{ id: "s1", dossierId: "paul", date: "2026-11-19", cree: "2026-11-19T10:00:00Z", contenu: "Douleur 6/10, élévation 120°." }]
  };
  await page.evaluate(async magasins => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(Object.keys(magasins), "readwrite");
    for (const [nom, l] of Object.entries(magasins)) for (const x of l as unknown[]) tx.objectStore(nom).put(x);
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, magasins);
  await page.reload();
}

test("carte du corps : l'épaule agrandie, toucher une zone, l'enlever, la remettre ; objectifs avec case « Atteint »", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T09:10:00"));
  await page.goto("/");
  await semer(page);
  // Ma journée : un petit corps dans la fiche, l'objectif en cours
  const carteJ = page.locator(".jcarte").first();
  await expect(carteJ.locator(".jmini svg")).toBeVisible();
  await expect(carteJ).toContainText("Jouer 1 h au tennis sans douleur");
  await carteJ.click();
  // une seule région : l'épaule droite agrandie, une vue à la fois
  const carte = page.locator("#carte");
  await expect(carte.locator(".cvues button")).toHaveText(["Face", "Profil droit", "Dos"]);
  await expect(carte.locator(".clist")).toContainText("Deltoïde droit, faisceau postérieur");
  await carte.getByRole("button", { name: "Dos" }).click();
  await expect(carte.getByRole("button", { name: "Dos" })).toHaveAttribute("aria-pressed", "true");
  // toucher une zone : la bulle ; « Enlever » l'envoie dans les anciennes zones
  await carte.locator('.clist [data-z="deltoide_post|d|pain"]').click();
  await expect(carte.locator(".cbulle")).toContainText("Douloureux");
  await carte.locator(".cbulle").getByRole("button", { name: "Enlever" }).click();
  await expect(carte.locator(".clist")).not.toContainText("Deltoïde droit, faisceau postérieur");
  await carte.locator(".canciennes summary").click();
  await expect(carte.locator(".canciennes")).toContainText("enlevée à la main");
  await carte.locator(".canciennes").getByRole("button", { name: "Remettre" }).click();
  await expect(carte.locator(".clist")).toContainText("Deltoïde droit, faisceau postérieur");
  // la flèche ramène au corps entier
  await carte.getByRole("button", { name: /Corps entier/ }).click();
  await expect(carte.locator(".cduo svg")).toHaveCount(2);
  // objectifs : celui du bilan et celui de la dictée (marqué « nouveau »), une case « Atteint »
  const obj = page.locator(".objectifs");
  await expect(obj.locator(".objcases li")).toHaveCount(2);
  await expect(obj).toContainText("nouveau");
  await obj.locator("[data-objc]").first().check();
  await expect(obj.locator(".objcases .fait")).toContainText("Atteint le 23/11");
  // suivi chiffré : douleur 6/10 avec son évolution depuis le bilan (8)
  await expect(page.locator(".suivi")).toContainText("6/10");
  // Ma journée : l'objectif atteint n'y est plus, le suivant le remplace
  await page.getByRole("button", { name: "Ma journée" }).click();
  await expect(page.locator(".jcarte").first()).toContainText("Ranger une assiette en hauteur sans douleur");
});
