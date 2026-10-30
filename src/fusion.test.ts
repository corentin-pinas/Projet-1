import { describe, expect, it } from "vitest";
import { egal, fusion3, stable } from "./fusion";

const seance = { id: "s1", dossierId: "d1", date: "2026-11-02", contenu: "Mobilisation épaule." };

describe("fusion de deux versions d'un même élément", () => {
  it("l'ordre des clés ne compte pas, undefined vaut absent", () => {
    expect(stable({ b: 1, a: [1, { y: 2, x: undefined }] })).toBe(stable({ a: [1, { y: 2 }], b: 1 }));
    expect(egal(undefined, null)).toBe(true);
  });

  it("changé d'un seul côté : ce côté gagne", () => {
    const local = { ...seance, contenu: "Mobilisation épaule, puis renforcement." };
    expect(fusion3(seance, local, seance)).toEqual(local);
    expect(fusion3(seance, seance, local)).toEqual(local);
  });

  it("nouvel élément d'un côté ou de l'autre", () => {
    expect(fusion3(null, null, seance)).toEqual(seance);
    expect(fusion3(null, seance, null)).toEqual(seance);
  });

  it("supprimé d'un côté sans changement de l'autre : la suppression est respectée", () => {
    expect(fusion3(seance, null, seance)).toBeNull();
    expect(fusion3(seance, seance, null)).toBeNull();
  });

  it("supprimé d'un côté, modifié de l'autre : la modification l'emporte", () => {
    const modifiee = { ...seance, contenu: "Changé sur le PC." };
    expect(fusion3(seance, null, modifiee)).toEqual(modifiee);
    expect(fusion3(seance, modifiee, null)).toEqual(modifiee);
  });

  it("deux champs différents changés de chaque côté : les deux changements sont gardés", () => {
    const local = { ...seance, contenu: "Texte corrigé sur la tablette." };
    const distant = { ...seance, bref: "Mobilisation." };
    expect(fusion3(seance, local, distant)).toEqual({ ...seance, contenu: "Texte corrigé sur la tablette.", bref: "Mobilisation." });
  });

  it("le même champ changé des deux côtés : la version de cet appareil l'emporte", () => {
    expect(fusion3(seance, { ...seance, contenu: "ici" }, { ...seance, contenu: "là-bas" })).toEqual({ ...seance, contenu: "ici" });
  });

  it("rendez-vous ajoutés sur deux appareils : tous gardés, un retiré d'un côté reste retiré", () => {
    const base = { id: "d1", label: "Marc D.", rdvs: [{ d: "2026-11-03", p: "am" }, { d: "2026-11-05", p: "pm" }] };
    const tablette = { ...base, rdvs: [{ d: "2026-11-03", p: "am" }, { d: "2026-11-05", p: "pm" }, { d: "2026-11-10", p: "am" }] };
    const pc = { ...base, rdvs: [{ d: "2026-11-03", p: "am" }, { d: "2026-11-07", p: "pm" }] };   // le 5 retiré, le 7 ajouté
    expect(fusion3(base, tablette, pc)).toEqual({ ...base, rdvs: [{ d: "2026-11-03", p: "am" }, { d: "2026-11-07", p: "pm" }, { d: "2026-11-10", p: "am" }] });
  });

  it("corrections et points validés faits sur deux appareils : réunis", () => {
    const base = { id: "b1", valides: ["âge"], corrections: [] as unknown[] };
    const ici = { ...base, valides: ["âge", "EVA"], corrections: [{ point: "date", correction: "12/10", quand: "t1" }] };
    const pc = { ...base, valides: ["âge", "métier"], corrections: [{ point: "côté", correction: "droit", quand: "t2" }] };
    const r = fusion3(base, ici, pc) as typeof base;
    expect(r.valides.sort()).toEqual(["EVA", "métier", "âge"].sort());
    expect(r.corrections).toHaveLength(2);
  });

  it("sans version commune (premier échange) : les champs différents prennent la version de cet appareil, les autres sont réunis", () => {
    expect(fusion3(null, { id: "x", a: 1, b: 2 }, { id: "x", a: 9, c: 3 })).toEqual({ id: "x", a: 1, b: 2, c: 3 });
  });
});
