import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
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
