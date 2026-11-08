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

  it("deux retours en arrière de suite, puis « Annuler » : le travail du jour revient (audit M5)", async () => {
    jour("2026-10-01");
    await db.creerPatient("Anne A.");
    jour("2026-10-02");
    await db.creerPatient("Bruno B.");     // la copie du 2 garde Anne seule
    jour("2026-10-03");
    await db.creerPatient("Chloé C.");     // la copie du 3 garde Anne et Bruno ; Chloé = travail du jour
    const noms = async () => (await db.tout()).dossiers.map(d => d.label).sort();
    await db.revenirA("2026-10-02");
    expect(await noms()).toEqual(["Anne A."]);
    await db.revenirA("2026-10-03");       // essai d'une autre copie, sans rien changer entre les deux
    expect(await noms()).toEqual(["Anne A.", "Bruno B."]);
    await db.revenirA(db.AVANT_RETOUR);
    expect(await noms()).toEqual(["Anne A.", "Bruno B.", "Chloé C."]);
  });

  it("un changement fait après un retour en arrière est, lui, gardé par le retour suivant", async () => {
    jour("2026-10-01");
    await db.creerPatient("Anne A.");
    jour("2026-10-02");
    await db.creerPatient("Bruno B.");
    await db.revenirA("2026-10-02");
    await db.creerPatient("Denis D.");     // travail fait après le retour
    await db.revenirA("2026-10-02");
    await db.revenirA(db.AVANT_RETOUR);
    expect((await db.tout()).dossiers.map(d => d.label).sort()).toEqual(["Anne A.", "Denis D."]);
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

describe("copie hors de Chrome", () => {
  it("exporter puis importer sur une tablette neuve rend tout, fichiers compris", async () => {
    const b = await db.ajouterBilan([pdf("Bilan - Paul ROUX.pdf")]);
    await db.ajouterSeance(b.dossierId, "2026-10-01", "massage");
    const e = await db.exporter();
    expect(e.fichiers).toHaveLength(1);

    await db.fermer();
    globalThis.indexedDB = new IDBFactory();          // tablette neuve
    await db.importer(e);
    const { dossiers, bilans, seances } = await db.tout();
    expect([dossiers.length, bilans.length, seances.length]).toEqual([1, 1, 1]);
    expect(await (await db.fichierBlob(b.fichiers[0].id))!.text()).toBe("%PDF-1.4");
    expect((await db.listeCopies()).map(c => c.id)).toEqual([db.AVANT_RETOUR]);   // l'import peut s'annuler
  });
});

describe("patient sans bilan", () => {
  it("se crée avec prénom et initiale, puis reçoit son bilan au même nom", async () => {
    const d = await db.creerPatient("Paul G.", [{ d: "2026-10-28", h: "08:00" }]);
    await db.ajouterSeance(d.id, "2026-10-27", "mobilisation");
    const b = await db.ajouterBilan([pdf("Fiche Bilan Épaule - Paul GARCIA.pdf")]);
    expect(b.dossierId).toBe(d.id);
    const t = await db.tout();
    expect(t.dossiers).toHaveLength(1);
    expect(t.dossiers[0].homonyme).toBe(false);
    expect(t.seances[0].dossierId).toBe(d.id);
  });

  it("le bilan peut être ajouté depuis la fiche, quel que soit le nom du fichier", async () => {
    const d = await db.creerPatient("Marie-Laure D.");
    const b = await db.ajouterBilan([pdf("scan 12.pdf")], d.id);
    expect(b.dossierId).toBe(d.id);
    expect((await db.tout()).dossiers).toHaveLength(1);
  });

  it("refuse un deuxième patient au même nom", async () => {
    await db.creerPatient("Paul G.");
    await expect(db.creerPatient("Paul G.")).rejects.toThrow("existe déjà");
  });

  it("supprimer un patient retire tout, fichiers compris", async () => {
    const d = await db.creerPatient("Paul G.");
    const b = await db.ajouterBilan([pdf("x.pdf")], d.id);
    await db.ajouterSeance(d.id, "2026-10-27", "massage");
    await db.supprimerPatient(d.id);
    expect(await db.tout()).toEqual({ dossiers: [], bilans: [], seances: [] });
    expect(await db.fichierBlob(b.fichiers[0].id)).toBeNull();
  });
});

describe("partage avec le PC", () => {
  it("une base de la version précédente garde ses patients en passant à la version 4", async () => {
    await new Promise<void>((ok, ko) => {
      const r = indexedDB.open("mes-patients", 3);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("dossiers", { keyPath: "id" });
        d.createObjectStore("bilans", { keyPath: "id" }).createIndex("dossierId", "dossierId");
        d.createObjectStore("seances", { keyPath: "id" }).createIndex("dossierId", "dossierId");
        d.createObjectStore("fichiers", { keyPath: "id" });
        d.createObjectStore("parametres", { keyPath: "cle" });
        d.createObjectStore("copies", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const tx = r.result.transaction("dossiers", "readwrite");
        tx.objectStore("dossiers").put({ id: "a", label: "Marc D.", rdvs: [], homonyme: false, cree: "" });
        tx.oncomplete = () => { r.result.close(); ok(); };
      };
      r.onerror = () => ko(r.error);
    });
    expect((await db.tout()).dossiers.map(d => d.label)).toEqual(["Marc D."]);
    expect(await db.basesPartage()).toEqual(new Map());
  });

  it("ce qui arrive du PC est rangé, les suppressions aussi, et seuls les réglages partagés sont pris", async () => {
    const d = await db.creerPatient("Lucie M.");
    await db.ecrireParametre("horaires", { lun: 1 });
    const etat = await db.etatPartage();
    expect([...etat.keys()].sort()).toEqual(["dossiers/" + d.id, "parametres/horaires"]);
    await db.appliquerPartage([
      { cle: "dossiers/" + d.id, valeur: null },
      { cle: "seances/s9", valeur: { id: "s9", dossierId: "x", date: "2026-11-02", cree: "", contenu: "Venu du PC." } },
      { cle: "parametres/transmissions_mot", valeur: "Code 1234" },
      { cle: "parametres/cle_ia", valeur: "volée" }
    ], [{ cle: "seances/s9", valeur: {}, rev: 3 }]);
    const t = await db.tout();
    expect(t.dossiers).toEqual([]);
    expect(t.seances.map(s => s.contenu)).toEqual(["Venu du PC."]);
    expect(await db.lireParametre("transmissions_mot")).toBe("Code 1234");
    expect(await db.lireParametre("cle_ia")).toBeUndefined();
    expect((await db.basesPartage()).get("seances/s9")?.rev).toBe(3);
  });

  it("chaque bilan déposé porte l'appareil d'origine", async () => {
    const b = await db.ajouterBilan([pdf("Bilan - Paul G.pdf")]);
    expect(b.origine).toBe(await db.appareil());
  });
});

describe("dictées gardées et absences", () => {
  it("une dictée est gardée une fois, les 30 dernières seulement, retrouvées par jour", async () => {
    await db.garderDictee("2026-11-04", "avec Marc …");
    await db.garderDictee("2026-11-04", "avec Marc …");                       // relancée à l'identique
    expect(await db.dicteesDu("2026-11-04")).toHaveLength(1);
    for (let i = 0; i < 31; i++) await db.garderDictee("2026-11-05", "dictée " + i);
    expect(await db.dicteesDu("2026-11-04")).toHaveLength(0);                 // la plus ancienne est sortie
    expect(await db.dicteesDu("2026-11-05")).toHaveLength(30);
    expect((await db.etatPartage()).has("parametres/dictees")).toBe(true);    // partagée avec le PC
  });

  it("une absence se note et s'annule sur le dossier", async () => {
    const p = await db.creerPatient("Victor M.");
    await db.noterAbsence(p.id, "2026-11-04", true);
    expect((await db.tout()).dossiers[0].absences).toEqual(["2026-11-04"]);
    await db.noterAbsence(p.id, "2026-11-04", false);
    expect((await db.tout()).dossiers[0].absences).toBeUndefined();
  });
});

describe("fondations (1.5.2)", () => {
  it("F4 : une nouvelle version de la base ouverte ailleurs n'est pas bloquée ; cette fenêtre demande à être rechargée", async () => {
    const vu: string[] = [];
    db.quandBloque(b => vu.push(b));
    await db.creerPatient("Paul T.");
    const ouverte = await new Promise<string>(ok => {
      const r = indexedDB.open("mes-patients", 5);
      r.onsuccess = () => { r.result.close(); ok("ouverte"); };
      r.onblocked = () => setTimeout(() => ok("bloquée"), 500);
    });
    expect(ouverte).toBe("ouverte");
    expect(vu).toContain("recharger");
    db.quandBloque(() => {});
  });

  it("A3 : un rendez-vous est calculé sur les rendez-vous du moment, pas sur une lecture ancienne", async () => {
    const p = await db.creerPatient("Paul T.");
    const lu = (await db.tout()).dossiers[0].rdvs;   // lecture « à l'écran »
    await db.setRdvs(p.id, [{ d: "2026-11-10", h: "", p: "am" }]);   // posé entre-temps ailleurs
    await db.modifierRdvs(p.id, rdvs => [...rdvs, { d: "2026-11-12", h: "", p: "pm" }]);
    expect(lu).toEqual([]);
    expect((await db.tout()).dossiers[0].rdvs.map(r => r.d)).toEqual(["2026-11-10", "2026-11-12"]);
  });
});

describe("archivage (1.5.2)", () => {
  it("une séance notée après la fin de traitement rouvre le dossier ; créer un patient au nom d'un archivé le signale", async () => {
    const p = await db.creerPatient("Lucie M.");
    await db.finTraitement(p.id, "2026-03-12");
    await expect(db.creerPatient("Lucie M.")).rejects.toBeInstanceOf(db.ErreurArchive);
    await db.ajouterSeance(p.id, "2026-03-12", "dernière séance");
    expect((await db.tout()).dossiers[0].fin).toBe("2026-03-12");   // le jour même : toujours la fin
    await db.ajouterSeance(p.id, "2026-11-08", "elle revient pour l'autre épaule");
    expect((await db.tout()).dossiers[0].fin).toBeUndefined();
  });
});
