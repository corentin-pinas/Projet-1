import { expect, test, type Browser, type Page, type Route } from "@playwright/test";

/* Relevé du suivi (2.2.0, Muninn Suivi étape 1, choix de Corentin du 22 novembre 2026) : la mise au propre rend aussi
   ce que la note dit de l'évolution du patient ; ligne « Relevé » sous la séance, vérification et correction au toucher,
   pastilles des exercices dans la ligne « Suivi », et « Remplir le suivi » pour les séances d'avant.
   CAPTURES=<dossier> : enregistre les captures montrées à Corentin. */
const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const CAPTURES = process.env.CAPTURES;
const message = (json: unknown) => ({
  id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 50 }
});
const rel = (o: Record<string, unknown>) => ({ critere: "douleur", valeur: null, unite: null, mot: null, sens: null, exercices: null, detail: null, phrase: "", ...o });

async function nouvellePage(browser: Browser, largeur = 1280, hauteur = 800): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: largeur, height: hauteur }, ...(CAPTURES ? { deviceScaleFactor: 2 } : {}) })).newPage();
  await page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte"));
  await page.goto("/");
  return page;
}
async function semer(page: Page, magasins: Record<string, unknown[]>) {
  await page.evaluate(async magasins => {
    const db: IDBDatabase = await new Promise((ok, ko) => { const r = indexedDB.open("mes-patients"); r.onsuccess = () => ok(r.result); r.onerror = ko; });
    const tx = db.transaction(Object.keys(magasins), "readwrite");
    for (const [nom, l] of Object.entries(magasins)) for (const x of l) tx.objectStore(nom).put(x);
    tx.commit(); await new Promise(ok => tx.oncomplete = ok);
  }, magasins);
  await page.reload();
}
async function cleAPI(page: Page) {
  await page.locator("#regbtn").click(); await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();
}
async function simulerIA(page: Page, reponse: (texte: string) => unknown) {
  const demandes: string[] = [];
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model", display_name: "Claude Opus 5.5" } });
    const texte = (req.postDataJSON().messages[0].content as { text?: string }[]).map(b => b.text ?? "").join("");
    demandes.push(texte);
    return route.fulfill({ json: message(reponse(texte)) });
  });
  return demandes;
}

/* une patiente suivie depuis un mois, trois séances déjà relevées */
const anciennes = [
  { id: "s1", date: iso(-17), contenu: "Douleur 7 sur 10. A fait ses exercices tous les jours. Élévation 110°.", rel: [{ c: "douleur", n: 7, u: "/10", phrase: "Douleur 7 sur 10" }, { c: "exercices", ex: "fait", phrase: "A fait ses exercices tous les jours" }, { c: "elevation", n: 110, u: "°", phrase: "Élévation 110°" }] },
  { id: "s2", date: iso(-10), contenu: "Douleur 6 sur 10. Exercices faits. Élévation 120°.", rel: [{ c: "douleur", n: 6, u: "/10", phrase: "Douleur 6 sur 10" }, { c: "exercices", ex: "fait", phrase: "Exercices faits" }, { c: "elevation", n: 120, u: "°", phrase: "Élévation 120°" }] },
  { id: "s3", date: iso(-6), contenu: "Douleur 4 sur 10. Exercices un jour sur deux, ça tire à la fin. Élévation 140°.", rel: [{ c: "douleur", n: 4, u: "/10", phrase: "Douleur 4 sur 10" }, { c: "exercices", ex: "partie", detail: "un jour sur deux, ça tire à la fin", phrase: "Exercices un jour sur deux, ça tire à la fin" }, { c: "elevation", n: 140, u: "°", phrase: "Élévation 140°" }] }
];

test("relevé : sous la séance mise au propre, vérifié et corrigé au toucher, pastilles des exercices (2.2.0)", async ({ browser }) => {
  const page = await nouvellePage(browser, CAPTURES ? 1690 : 1280, CAPTURES ? 1000 : 800);
  const note = "Douleur à 4 sur 10, inchangée. Dort mieux, ne se réveille plus la nuit. A fait ses exercices les premiers jours puis arrêté, ça réveillait la douleur le soir. Mobilisations en élévation, 140° en actif.";
  const demandes = await simulerIA(page, () => ({
    propre: "État du patient : douleur à 4/10, inchangée. Dort mieux, ne se réveille plus la nuit. A fait ses exercices les premiers jours puis arrêté : ça réveillait la douleur le soir.\nFait en séance : mobilisations en élévation, 140° en actif.",
    resume: null, bref: "Douleur 4/10 inchangée, dort mieux. Élévation 140°.", rdv_date: null, rdv_heure: null, rdv_demi: null, rdv_autres: [], rdv_annules: [], objectifs: [], zones: [], fin_traitement: false,
    releves: [
      rel({ critere: "douleur", valeur: 4, unite: "/10", sens: "pareil", phrase: "Douleur à 4 sur 10, inchangée" }),
      rel({ critere: "sommeil", mot: "dort mieux", sens: "mieux", phrase: "Dort mieux, ne se réveille plus la nuit" }),
      rel({ critere: "exercices", exercices: "partie", detail: "arrêtés, ça réveillait la douleur le soir", phrase: "A fait ses exercices les premiers jours puis arrêté" }),
      rel({ critere: "elevation", valeur: 140, unite: "°", phrase: "140° en actif" }),
      rel({ critere: "force", mot: "en net progrès", phrase: "force du deltoïde en net progrès" })   // pas dans la note : refusé
    ]
  }));
  await semer(page, {
    parametres: [{ cle: "appareil", valeur: "tablette-test" }],
    dossiers: [{ id: "p", label: "Stéphanie V.", rdvs: [{ d: iso(3), h: "", p: "pm" }], homonyme: false, cree: "" }],
    bilans: [{ id: "b", dossierId: "p", fichier: "Bilan Stéphanie V", fichiers: [], ajoute: iso(-20) + "T10:00:00Z", valides: [], corrections: [],
      resume: { region: "Épaule D", date_bilan: iso(-20).split("-").reverse().join("/"), age: 52, coup_oeil: "Tendinopathie de la coiffe, épaule droite.", chiffres: [{ label: "EVA", valeur: "7/10" }, { label: "Élévation active", valeur: "100°" }], sections: [], a_verifier: [] } }],
    seances: anciennes.map(s => ({ id: s.id, dossierId: "p", date: s.date, cree: s.date + "T10:00:00Z", contenu: s.contenu, ia_ok: true, releves: s.rel, releves_source: s.contenu }))
  });
  await cleAPI(page);
  await page.locator("#list .item", { hasText: "Stéphanie V." }).click();
  /* les séances déjà relevées : courbes et pastilles */
  const suivi = page.locator(".suivi");
  await expect(suivi).toContainText("Exercices");
  await expect(suivi.locator(".pas")).toHaveCount(3);
  await expect(suivi).toContainText("observance 83 %");

  await page.locator("#sadd").click();
  await page.locator("#stext").fill(note);
  await page.locator("#ssave").click();
  const seance = page.locator(".seance").first();
  await expect(seance.locator(".releves")).toContainText("Relevé dans cette séance");
  const puces = seance.locator("button.rel");
  await expect(puces).toHaveCount(4);   // la force, absente de la note, est refusée
  await expect(puces.nth(0)).toContainText("Douleur");
  await expect(puces.nth(0)).toContainText("4/10");
  await expect(puces.nth(0)).toContainText("pareil");
  await expect(puces.nth(1)).toContainText("dort mieux");
  await expect(puces.nth(2)).toContainText("en partie");
  await expect(puces.nth(3)).toContainText("140°");
  expect(demandes.at(-1)).toContain('"releves"');
  await expect(suivi.locator(".pas")).toHaveCount(4);
  await expect(suivi).toContainText("observance 75 %");
  if (CAPTURES) {
    await page.locator(".seance").first().scrollIntoViewIfNeeded(); await page.screenshot({ path: CAPTURES + "/1-fiche-releve.png" });
    await suivi.evaluate(e => e.scrollIntoView({ block: "start" })); await page.waitForTimeout(300); await page.screenshot({ path: CAPTURES + "/0-ligne-suivi.png" });
  }

  /* toucher « Sommeil » : la phrase dite, puis « C'est juste » */
  await puces.nth(1).click();
  const dlg = page.locator("dialog.reldlg");
  await expect(dlg).toContainText("« Dort mieux, ne se réveille plus la nuit »");
  if (CAPTURES) await page.screenshot({ path: CAPTURES + "/2-verifier.png" });
  await dlg.getByRole("button", { name: "C'est juste" }).click();
  await expect(page.getByRole("status").last()).toContainText("Relevé vérifié");
  await expect(seance.locator("button.rel").nth(1)).toContainText("✓");

  /* corriger la douleur : 5/10 au lieu de 4/10 */
  await seance.locator("button.rel").nth(0).click();
  await dlg.getByRole("button", { name: "Corriger" }).click();
  await dlg.locator("#relval").fill("5/10");
  if (CAPTURES) await page.screenshot({ path: CAPTURES + "/3-corriger.png" });
  await dlg.getByRole("button", { name: "Enregistrer" }).click();
  await expect(seance.locator("button.rel").nth(0)).toContainText("5/10");
  await expect(suivi.locator(".g").first()).toContainText("5");

  /* la pastille d'exercices de la dernière séance ouvre le détail de la réalisation */
  await suivi.locator("button.pasbtn").last().click();
  await expect(dlg).toContainText("Réalisation : arrêtés, ça réveillait la douleur le soir");
  await dlg.getByRole("button", { name: "Fermer" }).click();

  /* une séance suivante : la correction est rappelée à l'IA en exemple */
  await page.locator("#sadd").click();
  await page.locator("#stext").fill("Douleur 3 sur 10.");
  await page.locator("#ssave").click();
  await expect.poll(() => demandes.length).toBeGreaterThan(1);
  expect(demandes.at(-1)).toContain("corrigé en « Douleur 5/10 (pareil) »");
});

test("relevé : « Remplir le suivi » relit les séances du dernier mois notées avant (2.2.0)", async ({ browser }) => {
  const page = await nouvellePage(browser);
  const demandes = await simulerIA(page, texte => {
    const ids = [...texte.matchAll(/Séance (\w+) \(/g)].map(m => m[1]);
    return { seances: ids.map(id => ({ id, releves: id === "a" ? [rel({ critere: "douleur", valeur: 6, unite: "/10", phrase: "Douleur 6 sur 10" })] : [rel({ critere: "douleur", valeur: 3, unite: "/10", sens: "mieux", phrase: "douleur 3 sur 10" })] })) };
  });
  await semer(page, {
    parametres: [{ cle: "appareil", valeur: "tablette-test" }, { cle: "cartes_remplies", valeur: { ids: ["p"] } }],
    dossiers: [{ id: "p", label: "Marc D.", rdvs: [{ d: iso(2), h: "", p: "am" }], homonyme: false, cree: "", zones: [] }],
    seances: [
      { id: "a", dossierId: "p", date: iso(-9), cree: iso(-9) + "T10:00:00Z", contenu: "Douleur 6 sur 10, massage.", ia_ok: true },
      { id: "c", dossierId: "p", date: iso(-2), cree: iso(-2) + "T10:00:00Z", contenu: "Va mieux, douleur 3 sur 10.", ia_ok: true }
    ]
  });
  await cleAPI(page);
  await page.locator("#regbtn").click();
  const zone = page.locator("#suivirattrapage");
  await expect(zone).toContainText("2 séances du dernier mois");
  if (CAPTURES) await zone.screenshot({ path: CAPTURES + "/4-remplir-le-suivi.png" });
  await zone.getByRole("button", { name: "Remplir le suivi" }).click();
  await expect(zone).toContainText("Terminé : 1 patient relu");
  expect(demandes.filter(d => d.includes("Séance a (")).length).toBe(1);
  await page.locator("#regfermer").click();
  await page.locator("#list .item", { hasText: "Marc D." }).click();
  await expect(page.locator(".seance").first().locator("button.rel")).toContainText("3/10");
  await expect(page.locator(".seance").first().locator("button.rel")).toContainText("mieux");
});
