import { describe, expect, it } from "vitest";
import {
  agesCompatibles, avecRdv, avenirDe, avenirFrom, heureFr, jourLabel, lignesListe, nomAffiche,
  patientFrom, prochainRdv, questionHomonyme, rdvsAVenir,
  type Bilan, type Dossier, type Seance
} from "./regles";

const bilan = (o: Partial<Bilan>): Bilan => ({
  id: "b", dossierId: "d", fichier: "f", fichiers: [], ajoute: "2026-09-01T10:00:00Z",
  resume: null, valides: [], corrections: [], ...o
});
const dossier = (o: Partial<Dossier>): Dossier => ({ id: "d", label: "Marc D.", rdvs: [], homonyme: false, cree: "", ...o });
const seance = (o: Partial<Seance>): Seance => ({ id: "s", dossierId: "d", date: "2026-10-01", cree: "2026-10-01T10:00:00Z", contenu: "", ...o });

describe("patientFrom", () => {
  it("garde le prénom et l'initiale d'un nom en majuscules", () => {
    expect(patientFrom("Fiche Bilan ÉPAULE - Sylvie FRANCE.pdf")).toBe("Sylvie F.");
  });
  it("garde une abréviation courte", () => {
    expect(patientFrom("Fiche Bilan Épaule - Sylvie Fr.pdf")).toBe("Sylvie Fr.");
  });
  it("ajoute le point à une initiale seule", () => {
    expect(patientFrom("Fiche Bilan Épaule - Stéphanie V.pdf")).toBe("Stéphanie V.");
  });
  it("réduit un nom long en minuscules à son initiale", () => {
    expect(patientFrom("bilan_marc_dupontel.pdf")).toBe("Bilan D."); // comme la version d'essai : sans « - », le premier mot est pris pour le prénom
    expect(patientFrom("Marc Dupontel.jpg")).toBe("Marc D.");
  });
});

describe("avenirFrom", () => {
  it("prend ce qui suit « pour la prochaine séance »", () => {
    expect(avenirFrom("Douleur 3/10. Pour la prochaine séance tester la force en RE.")).toBe("Tester la force en RE.");
  });
  it("reconnaît « la prochaine fois » et « à venir : »", () => {
    expect(avenirFrom("ok la prochaine fois on reprend l'élastique")).toBe("On reprend l'élastique");
    expect(avenirFrom("Fait en séance : massage\nÀ venir : bilan de fin")).toBe("Bilan de fin");
  });
  it("ne trouve rien sans mention", () => {
    expect(avenirFrom("Renforcement des rotateurs.")).toBe("");
  });
});

describe("avenirDe", () => {
  it("prend la séance la plus récente, même si elle n'a pas de mention", () => {
    const l = [seance({ id: "1", date: "2026-09-20", contenu: "Pour la prochaine séance : test" }), seance({ id: "2", date: "2026-09-27", contenu: "rien" })];
    expect(avenirDe(l)).toBeNull();
  });
  it("utilise le résumé de l'IA seulement s'il correspond au texte actuel", () => {
    const s = seance({ contenu: "Pour la prochaine : tester la RE", avenir_resume: "Tester RE.", avenir_source: "Tester la RE" });
    expect(avenirDe([s])!.texte).toBe("Tester RE.");
    expect(avenirDe([{ ...s, contenu: "Pour la prochaine : autre chose" }])!.texte).toBe("Autre chose");
  });
});

describe("rendez-vous", () => {
  it("ignore les rendez-vous passés et n'en garde qu'un par jour", () => {
    const l = rdvsAVenir([{ d: "2026-09-30", h: "" }, { d: "2026-10-05", h: "09:00" }, { d: "2026-10-05", h: "10:00" }, { d: "2026-10-03", h: "" }], "2026-10-02");
    expect(l).toEqual([{ d: "2026-10-03", h: "" }, { d: "2026-10-05", h: "10:00" }]);
  });
  it("remplace le rendez-vous du même jour", () => {
    expect(avecRdv([{ d: "2026-10-05", h: "09:00" }], "2026-10-05", "11:00")).toEqual([{ d: "2026-10-05", h: "11:00" }]);
  });
  it("donne le prochain et compte les suivants", () => {
    expect(prochainRdv([{ d: "2026-10-09", h: "" }, { d: "2026-10-03", h: "08:30" }], "2026-10-02"))
      .toEqual({ k: "2026-10-03 08:30", date: "2026-10-03", heure: "08:30", autres: 1 });
  });
  it("écrit l'heure et le jour à la française", () => {
    expect(heureFr("08:30")).toBe("8 h 30");
    expect(heureFr("14:00")).toBe("14 h");
    const now = new Date(2026, 9, 2, 9);
    expect(jourLabel("2026-10-02", now)).toBe("Aujourd'hui");
    expect(jourLabel("2026-10-03", now)).toBe("Demain");
    expect(jourLabel("2026-10-05", now)).toBe("Lundi 5 octobre");
  });
});

describe("homonymes", () => {
  const resume = (age: number, date: string) => ({ age, date_bilan: date });
  it("âges compatibles : un an de marge, plus un an par année écoulée", () => {
    const a = bilan({ resume: resume(64, "01/09/2026") });
    expect(agesCompatibles(a, bilan({ resume: resume(65, "01/09/2026") }))).toBe(true);
    expect(agesCompatibles(a, bilan({ resume: resume(66, "01/09/2026") }))).toBe(false);
    expect(agesCompatibles(a, bilan({ resume: resume(66, "02/09/2027") }))).toBe(true);
  });
  it("un âge inconnu ne permet pas de trancher", () => {
    expect(agesCompatibles(bilan({ resume: {} }), bilan({ resume: resume(30, "01/01/2026") }))).toBe(true);
  });
  it("pose la question seulement une fois le nouveau bilan résumé", () => {
    const ancien = dossier({ id: "a", label: "Sylvie F." });
    const nouveau = dossier({ id: "n", label: "Sylvie F.", homonyme: true });
    const bA = bilan({ id: "1", dossierId: "a", resume: resume(64, "01/03/2026") });
    expect(questionHomonyme(nouveau, [ancien, nouveau], [bA, bilan({ id: "2", dossierId: "n" })])).toBeNull();
    expect(questionHomonyme(nouveau, [ancien, nouveau], [bA, bilan({ id: "2", dossierId: "n", resume: resume(64, "01/09/2026") })])).toBe(ancien);
    expect(questionHomonyme(nouveau, [ancien, nouveau], [bA, bilan({ id: "2", dossierId: "n", resume: resume(41, "01/09/2026") })])).toBeNull();
  });
  it("affiche l'âge seulement quand deux dossiers portent le même nom", () => {
    const a = dossier({ id: "a", label: "Sylvie F." }), b = dossier({ id: "b", label: "Sylvie F." }), c = dossier({ id: "c", label: "Paul R." });
    expect(nomAffiche(a, 64, [a, b, c])).toBe("Sylvie F., 64 ans");
    expect(nomAffiche(c, 50, [a, b, c])).toBe("Paul R.");
  });
});

describe("liste des patients", () => {
  it("classe par rendez-vous, puis les patients sans rendez-vous par ordre alphabétique", () => {
    const ds = [
      dossier({ id: "1", label: "Anne T." }),
      dossier({ id: "2", label: "Paul R.", rdvs: [{ d: "2026-10-03", h: "08:00" }] }),
      dossier({ id: "3", label: "Marc D.", rdvs: [{ d: "2026-10-02", h: "08:30" }] }),
      dossier({ id: "4", label: "Lucie B.", rdvs: [{ d: "2026-10-02", h: "09:15" }] }),
      dossier({ id: "5", label: "Bruno C." })
    ];
    expect(lignesListe(ds, [], "", "2026-10-02").map(l => l.dossier.label))
      .toEqual(["Marc D.", "Lucie B.", "Paul R.", "Anne T.", "Bruno C."]);
  });
  it("cherche dans le nom et le nom du fichier", () => {
    const ds = [dossier({ id: "1", label: "Anne T." }), dossier({ id: "2", label: "Paul R." })];
    const bs = [bilan({ dossierId: "2", fichier: "Bilan coude - Paul R" })];
    expect(lignesListe(ds, bs, "coude", "2026-10-02").map(l => l.dossier.label)).toEqual(["Paul R."]);
  });
});
