/* Partage entre appareils, joué avec le vrai code de l'appli (src/db.ts, src/synchro.ts) et le vrai Muninn du PC.
   Chaque « appareil » a sa propre base IndexedDB (fake-indexeddb).
   Scénarios repris de l'audit du 3 novembre 2026 (AUDIT.md). Les tests marqués « défaut connu » (it.fails) décrivent
   le bon comportement, pas encore atteint : à la correction, ils passent, it.fails devient rouge, et on retire « .fails ». */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE, changementsPC, lancerPC, type PC } from "./pc";

type DB = typeof import("../../src/db");
type Sync = typeof import("../../src/synchro");
type Appareil = { db: DB; sync: Sync };

async function appareil(): Promise<Appareil> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const db = await import("../../src/db");
  const sync = await import("../../src/synchro");
  await db.appareil();   // ouvre sa base maintenant, dans sa propre fabrique
  return { db, sync };
}
const echanger = async (a: Appareil) => { await a.sync.synchroniser(); return a.sync.etatSync(); };
const seance = async (a: Appareil, id: string) => (await a.db.tout()).seances.find(s => s.id === id);

const pcs: PC[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const p of pcs.splice(0)) await p.arreter(); });
const nouveauPC = async (dossier?: string) => { const p = await lancerPC(dossier); pcs.push(p); return p; };

describe("partage entre appareils", () => {
  it("une séance notée sur la tablette arrive sur le téléphone", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s = await tab.db.ajouterSeance(p.id, "2026-11-03", "douleur 4 sur 10");
    await tab.sync.relier(pc.url, CODE);
    expect(tab.sync.etatSync().erreur).toBeNull();
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    expect((await seance(tel, s.id))?.contenu).toBe("douleur 4 sur 10");
  });

  it("première liaison : une tablette pleine envoie tout à un PC vide, puis un appareil vide reçoit tout", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    await tab.db.ajouterSeance(p.id, "2026-11-03", "séance 1");
    await tab.db.ajouterSeance(p.id, "2026-11-04", "séance 2");
    await tab.sync.relier(pc.url, CODE);
    const surPC = await changementsPC(pc);
    expect(surPC.changements.filter((c: { cle: string }) => c.cle.startsWith("seances/"))).toHaveLength(2);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    const t = await tel.db.tout();
    expect(t.dossiers.map(d => d.label)).toEqual(["Paul T."]);
    expect(t.seances).toHaveLength(2);
  });

  it("C1 : tablette neuve, restaurer le fichier de copie puis relier ne doit pas remettre les anciennes versions", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const q = await tab.db.creerPatient("Zoé Q.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-10-20", "texte dicté, avec une erreur");
    await tab.sync.relier(pc.url, CODE);
    const fichier = await tab.db.exporter();                      // « Copier hors de Chrome » du lundi
    await tab.db.majSeance(s1.id, { contenu: "texte corrigé le mardi" });
    await tab.db.supprimerPatient(q.id);                          // patient supprimé le mardi
    expect((await echanger(tab)).erreur).toBeNull();

    const neuve = await appareil();                               // tablette perdue : la neuve restaure puis se relie
    await neuve.db.importer(fichier);
    await neuve.sync.relier(pc.url, CODE);
    await echanger(tab);

    for (const a of [tab, neuve]) {
      expect((await seance(a, s1.id))?.contenu).toBe("texte corrigé le mardi");
      expect((await a.db.tout()).dossiers.some(d => d.id === q.id)).toBe(false);
    }
  });

  it("C1 : délier puis relier un appareil resté en arrière ne doit pas écraser les nouvelles versions", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "version 1");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    await tel.sync.delier();
    await tab.db.majSeance(s1.id, { contenu: "version 2, corrigée sur la tablette" });
    await echanger(tab);
    await tel.sync.relier(pc.url, CODE);
    await echanger(tab);
    expect((await seance(tab, s1.id))?.contenu).toBe("version 2, corrigée sur la tablette");
    expect((await seance(tel, s1.id))?.contenu).toBe("version 2, corrigée sur la tablette");
  });

  it("C1 : un appareil délié qui a travaillé seul garde ses changements en se reliant au même PC", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "version 1");
    const s2 = await tab.db.ajouterSeance(p.id, "2026-11-04", "séance 2");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    await tel.sync.delier();
    await tel.db.majSeance(s1.id, { contenu: "corrigée sur le téléphone, délié" });
    await tab.db.majSeance(s2.id, { contenu: "séance 2 corrigée sur la tablette" });
    await echanger(tab);
    await tel.sync.relier(pc.url, CODE);
    await echanger(tab);
    for (const a of [tab, tel]) {
      expect((await seance(a, s1.id))?.contenu).toBe("corrigée sur le téléphone, délié");
      expect((await seance(a, s2.id))?.contenu).toBe("séance 2 corrigée sur la tablette");
    }
  });

  it("C1 : sur la tablette neuve, ce que le PC n'a jamais connu (créé après la copie, jamais envoyé) est gardé et envoyé", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    await tab.sync.relier(pc.url, CODE);
    const neuve = await appareil();
    const q = await neuve.db.creerPatient("Léa N.");                     // patient noté sur l'appareil avant de le relier
    await neuve.sync.relier(pc.url, CODE);
    await echanger(tab);
    for (const a of [tab, neuve]) expect((await a.db.tout()).dossiers.map(d => d.id).sort()).toEqual([p.id, q.id].sort());
  });

  it.fails("défaut connu (E1) : un PC remis à une copie plus ancienne doit être signalé, pas « À jour »", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "version 1");
    await tab.sync.relier(pc.url, CODE);
    copyFileSync(join(pc.dossier, "donnees.json"), join(pc.dossier, "ancienne-copie.json"));
    await tab.db.majSeance(s1.id, { contenu: "version 2" });
    await tab.db.ajouterSeance(p.id, "2026-11-04", "séance 2");
    expect((await echanger(tab)).erreur).toBeNull();

    await pc.arreter();                                           // le PC repart d'une copie de la veille
    copyFileSync(join(pc.dossier, "ancienne-copie.json"), join(pc.dossier, "donnees.json"));
    const pc2 = await nouveauPC(pc.dossier);
    await tab.db.ecrireParametre("sync_adresse", pc2.url);        // même PC ; nouveau port dans ce test seulement
    await tab.db.majSeance(s1.id, { contenu: "version 3" });
    expect((await echanger(tab)).erreur).not.toBeNull();
  });

  it.fails("défaut connu (F1) : une séance ajoutée hors connexion à un patient supprimé ailleurs ne doit pas devenir invisible", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    await tab.db.ajouterSeance(p.id, "2026-11-02", "séance 1");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    const s2 = await tel.db.ajouterSeance(p.id, "2026-11-03", "séance notée sur le téléphone hors connexion");
    await tab.db.supprimerPatient(p.id);
    await echanger(tab); await echanger(tel); await echanger(tab);
    for (const a of [tab, tel]) {
      const t = await a.db.tout();
      const s = t.seances.find(x => x.id === s2.id);
      expect(s && t.dossiers.some(d => d.id === s.dossierId)).toBe(true);
    }
  });

  it.fails("défaut connu (F2) : un rendez-vous posé pendant la réception d'un échange ne doit pas être écrasé", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    await tab.db.ajouterSeance(p.id, "2026-11-03", "dictée");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    await tel.db.setRdvs(p.id, [{ d: "2026-11-10", h: "", p: "am" }]);
    await echanger(tel);
    const vrai = tab.db.appliquerPartage;
    let fait = false;
    vi.spyOn(tab.db, "appliquerPartage").mockImplementation(async (e, b) => {
      if (!fait && e.length) { fait = true; await tab.db.setRdvs(p.id, [{ d: "2026-11-12", h: "", p: "pm" }]); }
      return vrai(e, b);
    });
    await echanger(tab);
    expect(fait).toBe(true);
    expect((await tab.db.tout()).dossiers[0].rdvs.some(r => r.d === "2026-11-12")).toBe(true);
  });
});
