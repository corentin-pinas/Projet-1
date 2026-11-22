import { describe, expect, it } from "vitest";
import { corriger, exemplesReleves, exercicesDe, lireReleves, nombreDit, observance, relevesDe, valeurReleve } from "./releves";
import { patchAnalyse } from "./rangement";
import { empreinteTexte, suiviDe, type Seance } from "./regles";

const note = "Douleur à 4 sur 10, inchangée. Dort mieux, ne se réveille plus la nuit. A fait ses exercices les premiers jours puis arrêté, ça réveillait la douleur le soir. Élévation 140° en actif.";
const item = (o: Record<string, unknown>) => ({ critere: "douleur", valeur: null, unite: null, mot: null, sens: null, exercices: null, detail: null, phrase: "", ...o });

describe("relevé lu dans la réponse de l'IA (garde-fous)", () => {
  it("garde ce qui est dit, avec sa phrase", () => {
    const r = lireReleves([
      item({ critere: "douleur", valeur: 4, unite: "/10", sens: "pareil", phrase: "Douleur à 4 sur 10, inchangée" }),
      item({ critere: "sommeil", mot: "dort mieux", sens: "mieux", phrase: "Dort mieux, ne se réveille plus la nuit" }),
      item({ critere: "exercices", exercices: "partie", detail: "arrêtés, ça réveillait la douleur", phrase: "A fait ses exercices les premiers jours puis arrêté" }),
      item({ critere: "Élévation", valeur: 140, unite: "°", phrase: "Élévation 140° en actif" })
    ], note);
    expect(r.map(x => [x.c, valeurReleve(x)])).toEqual([["douleur", "4/10"], ["sommeil", "dort mieux"], ["exercices", "en partie"], ["elevation", "140°"]]);
    expect(r[0].sens).toBe("pareil");
    expect(r[2].detail).toContain("réveillait");
  });
  it("une phrase qui ne vient pas de la note est refusée", () => {
    expect(lireReleves([item({ critere: "force", mot: "en progrès", phrase: "Force du deltoïde nettement en progrès cette semaine" })], note)).toEqual([]);
  });
  it("un chiffre absent de la note est retiré, une douleur au-delà de 10 aussi", () => {
    const r = lireReleves([item({ critere: "douleur", valeur: 6, sens: "pareil", phrase: "Douleur à 4 sur 10, inchangée" })], note);
    expect(r[0].n).toBeUndefined();
    expect(r[0].sens).toBe("pareil");
    expect(lireReleves([item({ critere: "douleur", valeur: 40, phrase: "Douleur à 4 sur 10" })], note + " 40")).toEqual([]);
  });
  it("exercices : fait, en partie ou pas fait, sinon rien", () => {
    expect(lireReleves([item({ critere: "exercices", mot: "fait", phrase: "A fait ses exercices" })], note)).toEqual([]);
  });
  it("un critère une seule fois, un critère inconnu gardé sous son nom", () => {
    const r = lireReleves([item({ critere: "reprise du golf", mot: "a repris", phrase: "Dort mieux" }), item({ critere: "reprise du golf", mot: "x", phrase: "Dort mieux" })], note);
    expect(r).toHaveLength(1);
    expect(r[0].c).toBe("reprise du golf");
  });
  it("nombres écrits en chiffres ou en lettres", () => {
    expect(nombreDit(4, "douleur à quatre sur dix")).toBe(true);
    expect(nombreDit(32, "ouverture 32mm")).toBe(true);
    expect(nombreDit(4.5, "EVA 4,5")).toBe(true);
    expect(nombreDit(3, "douleur 13/10")).toBe(false);
    expect(nombreDit(140, "élévation cent quarante")).toBe(false);
  });
});

const seance = (id: string, date: string, contenu: string, releves?: Seance["releves"]): Seance => ({ id, dossierId: "d", date, cree: date + "T10:00:00Z", contenu,
  ...(releves ? { releves, releves_source: empreinteTexte(contenu) } : {}) });

describe("relevé sur la séance et dans le suivi", () => {
  it("un relevé ne vaut que pour le texte dont il vient", () => {
    const s = seance("a", "2026-11-03", "Douleur 4/10.", [{ c: "douleur", n: 4, u: "/10", phrase: "Douleur 4/10" }]);
    expect(relevesDe(s)).toHaveLength(1);
    expect(relevesDe({ ...s, contenu: "Douleur 5/10." })).toEqual([]);
  });
  it("les courbes prennent le relevé, mots compris, et la lecture des chiffres en secours", () => {
    const ses = [
      seance("a", "2026-11-03", "Douleur 6/10."),
      seance("b", "2026-11-06", "Va mieux, douleur à quatre sur dix.", [{ c: "douleur", n: 4, u: "/10", phrase: "douleur à quatre sur dix" }, { c: "rotation_externe", n: 30, u: "°", phrase: "x" }]),
      seance("c", "2026-11-10", "Douleur inchangée.", [{ c: "douleur", sens: "pareil", phrase: "Douleur inchangée" }, { c: "rotation_externe", n: 35, u: "°", phrase: "x" }])
    ];
    const su = suiviDe("d", [], ses);
    expect(su.douleur.map(p => p.v)).toEqual([6, 4]);
    expect(su.tendance).toEqual({ date: "2026-11-10", texte: "douleur inchangée", sens: "pareil" });
    expect(su.mesure?.label).toBe("Rotation externe");
    expect(su.mesure?.points.map(p => p.v)).toEqual([30, 35]);
  });
  it("pastilles des exercices et observance", () => {
    const ses = [
      seance("a", "2026-11-03", "t1", [{ c: "exercices", ex: "fait", phrase: "t1" }]),
      seance("b", "2026-11-06", "t2", [{ c: "exercices", ex: "partie", detail: "avec douleur", phrase: "t2" }]),
      seance("c", "2026-11-10", "t3", [{ c: "exercices", ex: "pas", phrase: "t3" }])
    ];
    const l = exercicesDe("d", ses);
    expect(l.map(e => e.ex)).toEqual(["fait", "partie", "pas"]);
    expect(observance(l)).toBe(50);
    expect(observance([])).toBeNull();
  });
  it("une nouvelle analyse n'écrase pas un relevé vérifié par Corentin pour le même texte", () => {
    const s = { ...seance("a", "2026-11-03", "Douleur 4/10.", [{ c: "douleur", n: 4, u: "/10", phrase: "Douleur 4/10", ok: true }]), releves_main: true };
    const a = { propre: "", resume: "", bref: "", rdvDate: "", rdvHeure: "", rdvDemi: "" as const, releves: [{ c: "douleur", n: 5, u: "/10", phrase: "Douleur 4/10" }] };
    expect(patchAnalyse(s, a, "").releves).toBeUndefined();
    expect(patchAnalyse({ ...s, contenu: "Douleur 5/10." }, a, "").releves).toHaveLength(1);
  });
});

describe("correction à la main", () => {
  const r = { c: "douleur", n: 4, u: "/10", phrase: "Douleur 4/10" };
  it("un chiffre, des mots, un sens", () => {
    expect(corriger(r, "5/10")).toMatchObject({ n: 5, u: "/10", ok: true });
    expect(corriger(r, "12")).toBeNull();
    expect(corriger(r, "mieux")).toMatchObject({ sens: "mieux" });
    expect(corriger({ c: "sommeil", mot: "bof", phrase: "x" }, "se réveille 2 fois")).toMatchObject({ mot: "se réveille 2 fois" });
    expect(corriger({ c: "exercices", ex: "fait", phrase: "x" }, "en partie")).toMatchObject({ ex: "partie" });
    expect(corriger({ c: "exercices", ex: "fait", phrase: "x" }, "pas fait")).toMatchObject({ ex: "pas" });
  });
  it("les corrections reviennent à l'IA comme exemples, les plus récentes d'abord", () => {
    const s1 = { ...seance("a", "2026-11-03", "t"), releves_corr: [{ phrase: "p1", avant: "Douleur 4/10", apres: "Douleur 5/10" }] };
    const s2 = { ...seance("b", "2026-11-06", "t"), cree: "2026-11-06T11:00:00Z", releves_corr: [{ phrase: "p2", avant: "Force mieux", apres: "(rien à relever)" }] };
    expect(exemplesReleves([s1, s2])).toEqual(["« p2 » : relevé « Force mieux », corrigé en « (rien à relever) »", "« p1 » : relevé « Douleur 4/10 », corrigé en « Douleur 5/10 »"]);
  });
});
