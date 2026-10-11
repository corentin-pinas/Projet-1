import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";

const pdf = (nom: string) => new File(["%PDF-1.4"], nom, { type: "application/pdf" });

beforeEach(async () => {
  await db.fermer();
  globalThis.indexedDB = new IDBFactory();
});

describe("bilans et dossiers", () => {
  it("un bilan crée un dossier au nom tiré du fichier", async () => {
    const b = await db.ajouterBilan([pdf("Fiche Bilan Épaule - Marc DUPONT.pdf")]);
    const { dossiers, bilans } = await db.tout();
    expect(dossiers).toHaveLength(1);
    expect(dossiers[0].label).toBe("Marc D.");
    expect(dossiers[0].homonyme).toBe(false);
    expect(bilans[0].fichier).toBe("Fiche Bilan Épaule - Marc DUPONT");
    expect(await db.fichierBlob(b.fichiers[0].id)).not.toBeNull();
  });

  it("des photos choisies ensemble forment un seul bilan", async () => {
    await db.ajouterBilan([new File(["a"], "Lucie B p1.jpg", { type: "image/jpeg" }), new File(["b"], "Lucie B p2.jpg", { type: "image/jpeg" })]);
    const { bilans } = await db.tout();
    expect(bilans).toHaveLength(1);
    expect(bilans[0].fichiers).toHaveLength(2);
  });

  it("un deuxième bilan au même nom va dans un dossier marqué homonyme", async () => {
    await db.ajouterBilan([pdf("Bilan - Sylvie FAURE.pdf")]);
    await db.ajouterBilan([pdf("Bilan coude - Sylvie FABRE.pdf")]);
    const { dossiers } = await db.tout();
    expect(dossiers.map(d => d.label)).toEqual(["Sylvie F.", "Sylvie F."]);
    expect(dossiers.filter(d => d.homonyme)).toHaveLength(1);
  });

  it("« même personne » réunit bilans, séances et rendez-vous dans un seul dossier", async () => {
    const b1 = await db.ajouterBilan([pdf("Bilan - Sylvie FAURE.pdf")]);
    const b2 = await db.ajouterBilan([pdf("Bilan - Sylvie FAURE 2.pdf")]);
    await db.ajouterSeance(b2.dossierId, "2026-10-01", "séance du nouveau dossier");
    await db.setRdvs(b1.dossierId, [{ d: "2026-10-05", h: "09:00" }]);
    await db.setRdvs(b2.dossierId, [{ d: "2026-10-05", h: "10:00" }, { d: "2026-10-08", h: "" }]);
    await db.fusionner(b2.dossierId, b1.dossierId);
    const { dossiers, bilans, seances } = await db.tout();
    expect(dossiers).toHaveLength(1);
    expect(bilans.every(b => b.dossierId === b1.dossierId)).toBe(true);
    expect(seances[0].dossierId).toBe(b1.dossierId);
    expect(dossiers[0].rdvs).toEqual([{ d: "2026-10-05", h: "09:00" }, { d: "2026-10-08", h: "" }]);
  });

  it("« deux personnes différentes » renomme le nouveau dossier", async () => {
    await db.ajouterBilan([pdf("Bilan - Sylvie FAURE.pdf")]);
    const b = await db.ajouterBilan([pdf("Bilan - Sylvie FABRE.pdf")]);
    await db.renommer(b.dossierId, "Sylvie Fa.");
    const d = (await db.tout()).dossiers.find(d => d.id === b.dossierId)!;
    expect(d).toMatchObject({ label: "Sylvie Fa.", homonyme: false });
  });

  it("supprimer le dernier bilan supprime aussi le dossier et ses séances", async () => {
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    await db.ajouterSeance(b.dossierId, "2026-10-01", "massage");
    await db.supprimerBilan(b.id);
    expect(await db.tout()).toEqual({ dossiers: [], bilans: [], seances: [] });
    expect(await db.fichierBlob(b.fichiers[0].id)).toBeNull();
  });

  it("prévient l'écran à chaque changement", async () => {
    let n = 0;
    const stop = db.abonner(() => n++);
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    await db.ajouterSeance(b.dossierId, "2026-10-01", "massage");
    stop();
    expect(n).toBe(2);
  });
});

describe("réglages", () => {
  it("garde la clé de l'IA et peut l'effacer", async () => {
    await db.ecrireParametre("cle_ia", "sk-test");
    expect(await db.lireParametre("cle_ia")).toBe("sk-test");
    await db.ecrireParametre("cle_ia", undefined);
    expect(await db.lireParametre("cle_ia")).toBeUndefined();
  });

  it("additionne la consommation du mois", async () => {
    await db.ajouterConso("bilans", { entree: 9000, sortie: 4000 });
    await db.ajouterConso("seances", { entree: 3000, sortie: 1500 });
    expect(await db.consoDuMois()).toMatchObject({ bilans: 1, seances: 1, entree: 12000, sortie: 5500 });
  });
});

describe("copies de sécurité", () => {
  /* le « jour » de l'appli est réglé par l'horloge : chaque test dit quel jour on est */
  const jour = (iso: string) => vi.setSystemTime(new Date(iso + "T08:00:00"));
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("une copie par jour, 7 gardées au plus", async () => {
    jour("2026-10-01");
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    for (let j = 2; j <= 9; j++) {   // le 1er, la base était vide avant le premier changement : pas de copie
      jour(`2026-10-0${j}`);
      expect(await db.copieDuJour()).toBe(true);
      expect(await db.copieDuJour()).toBe(false);   // déjà faite ce jour-là
    }
    const copies = await db.listeCopies();
    expect(copies.map(c => c.id)).toEqual(["2026-10-09", "2026-10-08", "2026-10-07", "2026-10-06", "2026-10-05", "2026-10-04", "2026-10-03"]);
    expect(copies[0].donnees.bilans[0].id).toBe(b.id);
    expect(copies[0].taille).toBeGreaterThan(0);
  });

  it("pas de copie d'une base vide", async () => {
    jour("2026-10-01");
    expect(await db.copieDuJour()).toBe(false);
    expect(await db.listeCopies()).toEqual([]);
  });

  it("revenir à une copie rend un bilan supprimé par erreur, avec son PDF, et peut s'annuler", async () => {
    jour("2026-10-01");
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    await db.ajouterSeance(b.dossierId, "2026-10-01", "massage");
    jour("2026-10-02");
    await db.supprimerBilan(b.id);         // la copie du jour est faite juste avant
    expect((await db.tout()).bilans).toHaveLength(0);
    expect(await db.fichierBlob(b.fichiers[0].id)).not.toBeNull();   // gardé : la copie y renvoie

    await db.revenirA("2026-10-02");
    const apres = await db.tout();
    expect(apres.bilans.map(x => x.id)).toEqual([b.id]);
    expect(apres.seances).toHaveLength(1);
    expect(await db.fichierBlob(b.fichiers[0].id)).not.toBeNull();
    expect((await db.listeCopies()).map(c => c.id)).toEqual([db.AVANT_RETOUR, "2026-10-02"]);

    await db.revenirA(db.AVANT_RETOUR);   // annuler le retour
    expect((await db.tout()).bilans).toHaveLength(0);
    expect((await db.listeCopies()).map(c => c.id)).toEqual(["2026-10-02"]);
  });

  it("un fichier part quand plus aucune copie n'y renvoie", async () => {
    jour("2026-10-01");
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    jour("2026-10-02");
    await db.supprimerBilan(b.id);
    await db.ajouterBilan([pdf("Bilan - Lucie BERNARD.pdf")]);
    for (let j = 3; j <= 9; j++) { jour(`2026-10-0${j}`); await db.copieDuJour(); }   // la copie du 2 sort de la rotation
    expect(await db.fichierBlob(b.fichiers[0].id)).toBeNull();
  });

  it("la copie du jour garde l'état d'avant le premier changement de la journée", async () => {
    jour("2026-10-01");
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    jour("2026-10-02");
    await db.ajouterSeance(b.dossierId, "2026-10-02", "massage");
    await db.ajouterSeance(b.dossierId, "2026-10-02", "renforcement");
    const [copie] = await db.listeCopies();
    expect(copie.id).toBe("2026-10-02");
    expect(copie.donnees.bilans).toHaveLength(1);
    expect(copie.donnees.seances).toHaveLength(0);
  });
});
