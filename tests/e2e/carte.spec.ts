import { expect, test, type Page, type Route } from "@playwright/test";

const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50 }
});


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

test("rattrapage : « Remplir les cartes du corps » une fois, pour les patients déjà suivis", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T09:10:00"));
  await page.goto("/");
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    return route.fulfill({ json: message({ zones: [{ structure: "genou", cote: "g", etat: "pain", nom: "Genou gauche", depuis: "2026-10-05", fin: null, mieux: null }] }) });
  });
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(["dossiers", "bilans"], "readwrite");
    tx.objectStore("dossiers").put({ id: "lea", label: "Léa M.", rdvs: [{ d: "2026-11-23", h: "", p: "am" }], homonyme: false, cree: "2026-10-05T09:00:00Z" });
    tx.objectStore("bilans").put({ id: "b2", dossierId: "lea", fichier: "Bilan Léa M", fichiers: [], ajoute: "2026-10-05T09:00:00Z", valides: [], corrections: [],
      resume: { region: "Genou G", date_bilan: "05/10/2026", age: 30, coup_oeil: "Syndrome rotulien gauche.", chiffres: [], sections: [], objectifs: [], a_verifier: [] } });
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  });
  await page.reload();
  // la clé API de secours (les tests ne font aucune vraie demande)
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();
  await page.locator("#regbtn").click();
  await expect(page.locator("#rattrapage")).toContainText("Un patient en soins n'a pas encore de zones sur sa carte");
  await page.getByRole("button", { name: "Remplir les cartes du corps" }).click();
  await expect(page.locator("#rattrapageetat")).toContainText("Terminé : 1 carte remplie");
  await page.locator("#regfermer").click();
  await page.locator(".jcarte", { hasText: "Léa M." }).click();
  await expect(page.locator("#carte .clist")).toContainText("Genou gauche");
  // une fois fait, le bouton ne revient plus
  await page.locator("#regbtn").click();
  await expect(page.locator("#rattrapage")).toHaveCount(0);
});
