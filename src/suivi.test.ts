import { describe, expect, it } from "vitest";
import { rdvApres, suiviDe, type Bilan, type Dossier, type Seance } from "./regles";

const bilan = (chiffres: { label: string; valeur: string }[]): Bilan => ({ id: "b", dossierId: "d", fichier: "f", fichiers: [], ajoute: "2026-10-30T09:00:00Z",
  resume: { date_bilan: "30/10/2026", chiffres }, valides: [], corrections: [] });
const seance = (date: string, contenu: string): Seance => ({ id: date, dossierId: "d", date, cree: date + "T10:00:00Z", contenu });

describe("suivi chiffré lu dans le bilan et les séances", () => {
  it("douleur et élévation : bilan puis séances, un point seulement quand c'est écrit", () => {
    const s = suiviDe("d", [bilan([{ label: "EVA", valeur: "7/10" }, { label: "Élévation active", valeur: "100°" }])], [
      seance("2026-11-03", "Douleur à 6/10. Élévation 110°."),
      seance("2026-11-06", "Massage, pendulaires."),
      seance("2026-11-10", "EVA 4, élévation active jusqu'à 125°, 3 x 10 répétitions."),
    ]);
    expect(s.douleur.map(p => p.v)).toEqual([7, 6, 4]);
    expect(s.mesure?.label).toBe("Élévation active");
    expect(s.mesure?.points.map(p => p.v)).toEqual([100, 110, 125]);
    expect(s.tendance).toBeNull();
  });
  it("rien n'est deviné : « mal depuis 3 jours », « en 3 séries » ne sont pas des douleurs", () => {
    const s = suiviDe("d", [], [seance("2026-11-03", "Mal au dos depuis 3 jours, travail en 3 séries.")]);
    expect(s.douleur).toEqual([]);
    expect(s.mesure).toBeNull();
  });
  it("« moins de douleur » sans chiffre : une tendance, effacée par le chiffre suivant", () => {
    const b = [bilan([{ label: "EVA", valeur: "5/10" }])];
    expect(suiviDe("d", b, [seance("2026-11-03", "Moins de douleur depuis lundi.")]).tendance).toEqual({ date: "2026-11-03", texte: "moins de douleur" });
    const s = suiviDe("d", b, [seance("2026-11-03", "Moins de douleur."), seance("2026-11-06", "Douleur 3 sur 10.")]);
    expect(s.tendance).toBeNull();
    expect(s.douleur.map(p => p.v)).toEqual([5, 3]);
  });
  it("20 points au plus", () => {
    const ses = Array.from({ length: 25 }, (_, i) => seance(`2026-11-${String(i + 1).padStart(2, "0")}`, `Douleur ${i % 10}/10.`));
    expect(suiviDe("d", [], ses).douleur).toHaveLength(20);
  });
  it("prochain rendez-vous après ce jour", () => {
    const D = { rdvs: [{ d: "2026-11-30", h: "" }, { d: "2026-11-23", h: "" }, { d: "2026-11-26", h: "" }] } as Dossier;
    expect(rdvApres(D, "2026-11-23")?.d).toBe("2026-11-26");
  });
  it("« EVN pire » est une douleur ; l'âge n'est pas une mesure", () => {
    const s = suiviDe("d", [bilan([{ label: "Âge", valeur: "49" }, { label: "EVN pire", valeur: "8" }, { label: "Flexion", valeur: "120°" }])], []);
    expect(s.douleur.map(p => p.v)).toEqual([8]);
    expect(s.mesure?.label).toBe("Flexion");
  });
});
