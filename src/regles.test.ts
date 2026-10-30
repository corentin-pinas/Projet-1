import { describe, expect, it } from "vitest";
import {
  brefDe, journee, prochaineJournee, transmissions, joursSansRdv, semaineProchaine, HORAIRES_DEFAUT,
  agesCompatibles, avecRdv, avenirDe, avenirFrom, jourLabel, lignesListe, nomAffiche,
  plageDemi, placesPlage, placesPrises, demiDe, rdvKey, decalerJours, dureeRdv, numeroJour, rdvsDuJour, semaine, nomCorrespond, patientFrom, prochainRdv, questionHomonyme, rattacher, rdvsAVenir,
  type Bilan, type Dossier, type Rdv, type Seance
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
    expect(patientFrom("bilan_marc_dupontel.pdf")).toBe("Marc D.");   // sans « - », le mot « bilan » n'est pas pris pour le prénom
    expect(patientFrom("Marc Dupontel.jpg")).toBe("Marc D.");
  });
});

describe("patientFrom : prénoms composés", () => {
  it("garde le prénom composé en entier, avec ses majuscules", () => {
    expect(patientFrom("Fiche Bilan Épaule - Marie-Laure D.pdf")).toBe("Marie-Laure D.");
    expect(patientFrom("Fiche Bilan Épaule - Marie-Laure DUPONT.pdf")).toBe("Marie-Laure D.");
    expect(patientFrom("Fiche Bilan Épaule - Marie Laure D.pdf")).toBe("Marie-Laure D.");
    expect(patientFrom("Fiche Bilan Épaule - Marie - Laure D.pdf")).toBe("Marie-Laure D.");
    expect(patientFrom("Fiche Bilan Épaule - MARIE-LAURE DUPONT.pdf")).toBe("Marie-Laure D.");
    expect(patientFrom("Fiche Bilan Épaule - jean-pierre Fr.pdf")).toBe("Jean-Pierre Fr.");
    expect(patientFrom("Fiche Bilan Épaule - Anne-Sophie Le Goff.pdf")).toBe("Anne-Sophie L.");
    expect(patientFrom("Fiche Bilan Épaule - Anne-Sophie LE GOFF.pdf")).toBe("Anne-Sophie L.");
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
    expect(l).toEqual([{ d: "2026-10-03", h: "" }, { d: "2026-10-05", h: "10:00", p: "am" }]);
  });
  it("remplace le rendez-vous du même jour", () => {
    expect(avecRdv([{ d: "2026-10-05", h: "09:00" }], "2026-10-05", "", "seance", "pm")).toEqual([{ d: "2026-10-05", h: "", p: "pm" }]);
  });
  it("donne le prochain et compte les suivants", () => {
    expect(prochainRdv([{ d: "2026-10-09", h: "" }, { d: "2026-10-03", h: "08:30" }], "2026-10-02"))
      .toEqual({ k: "2026-10-03 1 08:30", date: "2026-10-03", heure: "08:30", demi: "am", bilan: false, autres: 1 });
  });
  it("écrit le jour à la française", () => {
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

describe("dictée groupée : rattacher un patient nommé", () => {
  const dos = (id: string, label: string, rdvs: Rdv[] = []): Dossier => ({ id, label, rdvs, homonyme: false, cree: "" });
  const jour = "2026-10-26";
  const marc = dos("m1", "Marc D.", [{ d: jour, h: "09:00" }]);
  const marc2 = dos("m2", "Marc L.");
  const elisa = dos("e", "Élisabeth G.");
  const sylvie = dos("s", "Sylvie Fr.");
  const claudine = dos("c", "ClaudineT");

  it("reconnaît le prénom avec ou sans initiale, nom complet compris, sans souci d'accents", () => {
    expect(nomCorrespond("Marc D.", "Marc D.")).toBe(true);
    expect(nomCorrespond("marc dupont", "Marc D.")).toBe(true);
    expect(nomCorrespond("Marc", "Marc D.")).toBe(true);
    expect(nomCorrespond("Marc L", "Marc D.")).toBe(false);
    expect(nomCorrespond("Elisabeth G", "Élisabeth G.")).toBe(true);
    expect(nomCorrespond("Sylvie F", "Sylvie Fr.")).toBe(true);
    expect(nomCorrespond("Claudine T", "ClaudineT")).toBe(true);
    expect(nomCorrespond("Claudine", "ClaudineT")).toBe(true);
    expect(nomCorrespond("Marc", "Marcel D.")).toBe(false);
    expect(nomCorrespond("Marie Laure", "Marie-Laure D.")).toBe(true);
    expect(nomCorrespond("Marie-Laure D", "Marie-Laure D.")).toBe(true);
    expect(nomCorrespond("Marie", "Marie-Laure D.")).toBe(false);
    expect(nomCorrespond("Laure", "Marie-Laure D.")).toBe(false);
  });

  it("un seul Marc vu ce jour-là : rangé chez lui, même s'il y a un autre Marc dans l'appli", () => {
    expect(rattacher("Marc", [marc, marc2, elisa], jour).dossier?.id).toBe("m1");
  });

  it("règle souple : un seul dossier à ce nom, rangé même sans rendez-vous ce jour-là", () => {
    expect(rattacher("Élisabeth", [marc, marc2, elisa], jour).dossier?.id).toBe("e");
  });

  it("deux Marc possibles et aucun vu ce jour-là : on pose la question", () => {
    const r = rattacher("Marc", [dos("m1", "Marc D."), marc2, elisa], jour);
    expect(r.dossier).toBeNull();
    expect(r.candidats.map(d => d.id)).toEqual(["m1", "m2"]);
  });

  it("deux Marc vus le même jour : on pose la question entre ces deux-là", () => {
    const r = rattacher("Marc", [dos("m2", "Marc L.", [{ d: jour, h: "08:00" }]), marc, dos("m3", "Marc P.")], jour);
    expect(r.dossier).toBeNull();
    expect(r.candidats.map(d => d.id)).toEqual(["m2", "m1"]);   // par heure de rendez-vous
  });

  it("nom inconnu : tous les dossiers sont proposés, ceux vus ce jour-là en tête", () => {
    const r = rattacher("Bernard", [elisa, marc2, marc], jour);
    expect(r.dossier).toBeNull();
    expect(r.candidats.map(d => d.id)).toEqual(["m1", "e", "m2"]);
  });

  it("passage sans patient : question aussi", () => {
    expect(rattacher(null, [marc], jour).dossier).toBeNull();
  });
});

describe("agenda", () => {
  it("la semaine va du lundi au samedi", () => {
    expect(semaine("2026-10-28")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(semaine("2026-11-01")[0]).toBe("2026-10-26");   // dimanche : semaine qui se termine
    expect(numeroJour("2026-10-26")).toBe(1);
    expect(decalerJours("2026-10-26", 7)).toBe("2026-11-02");
  });

  it("une séance dure 20 minutes, un bilan 40", () => {
    expect(dureeRdv({ d: "2026-10-28", h: "08:00" })).toBe(20);
    expect(dureeRdv({ d: "2026-10-28", h: "08:00", t: "bilan" })).toBe(40);
    expect(avecRdv([], "2026-10-28", "08:00", "bilan")).toEqual([{ d: "2026-10-28", h: "08:00", t: "bilan", p: "am" }]);
    expect(rdvsAVenir([{ d: "2026-10-28", h: "08:00", t: "bilan" }], "2026-10-01")[0].t).toBe("bilan");
  });

  it("demi-journées : choisie, ou déduite de l'heure ; matin avant l'après-midi ; places selon les horaires", () => {
    expect(demiDe({ d: "2026-10-28", h: "", p: "pm" })).toBe("pm");
    expect(demiDe({ d: "2026-10-28", h: "12:40" })).toBe("am");
    expect(demiDe({ d: "2026-10-28", h: "14:00" })).toBe("pm");
    expect(demiDe({ d: "2026-10-28", h: "" })).toBeNull();
    expect(rdvKey({ d: "2026-10-28", h: "", p: "am" }) < rdvKey({ d: "2026-10-28", h: "09:00", p: "pm" })).toBe(true);
    expect(avecRdv([], "2026-10-28", "", "seance", "pm")).toEqual([{ d: "2026-10-28", h: "", p: "pm" }]);
    const plages: [string, string][] = [["08:00", "12:00"], ["14:00", "19:00"]];
    expect(plageDemi(plages, "pm")).toEqual(["14:00", "19:00"]);
    expect(placesPlage(plageDemi(plages, "am"))).toBe(12);
    expect(placesPlage(plageDemi([["14:00", "18:00"]], "am"))).toBe(0);
    expect(placesPrises([{ d: "x", h: "", t: "bilan" }, { d: "x", h: "" }])).toBe(3);
  });

  it("les rendez-vous du jour, à l'heure, avec leur fin", () => {
    const d = (id: string, label: string, rdvs: Rdv[]): Dossier => ({ id, label, rdvs, homonyme: false, cree: "" });
    const r = rdvsDuJour([d("a", "Paul G.", [{ d: "2026-10-28", h: "10:00", t: "bilan" }]), d("b", "Marc D.", [{ d: "2026-10-28", h: "08:00" }, { d: "2026-10-29", h: "08:00" }])], "2026-10-28");
    expect(r.map(x => [x.dossier.label, x.debut, x.fin])).toEqual([["Marc D.", 480, 500], ["Paul G.", 600, 640]]);
  });
});

describe("Ma journée", () => {
  const D = (id: string, label: string, rdvs: { d: string; h: string; t?: "bilan" }[]) => ({ id, label, rdvs, homonyme: false, cree: "" });
  const S = (id: string, dossierId: string, date: string, contenu: string, x = {}) => ({ id, dossierId, date, cree: date + "T10:00:00Z", contenu, ...x });

  it("résumé court : celui de l'IA tant que la note n'a pas changé, sinon état et fait en séance", () => {
    const propre = "État du patient : douleur 3/10.\nFait en séance : pendulaires.\nÀ venir : tester la force.";
    expect(brefDe(S("1", "a", "2026-10-01", "brut", { propre, propre_source: "brut", bref: "Douleur 3/10.", bref_source: "brut" }))).toBe("Douleur 3/10.");
    expect(brefDe(S("1", "a", "2026-10-01", "brut", { propre, propre_source: "brut", bref: "Ancien", bref_source: "autre" }))).toBe("douleur 3/10. ; pendulaires.");
    expect(brefDe(S("1", "a", "2026-10-01", "massage   du trapèze"))).toBe("massage du trapèze");
    expect(brefDe(S("1", "a", "2026-10-01", "mot ".repeat(80))).length).toBeLessThanOrEqual(160);
  });

  it("petites fiches dans l'ordre des rendez-vous, avec ce qui est prévu et la séance d'avant", () => {
    const dossiers = [D("a", "Marc D.", [{ d: "2026-10-29", h: "10:00" }]), D("b", "Lucie M.", [{ d: "2026-10-29", h: "08:20", t: "bilan" }]), D("c", "Paul G.", [{ d: "2026-10-30", h: "09:00" }])];
    const seances = [
      S("1", "a", "2026-10-20", "renfo. Pour la prochaine séance tester la force"),
      S("2", "a", "2026-10-22", "pendulaires. La prochaine fois travail excentrique"),
      S("3", "a", "2026-10-29", "séance du jour")
    ];
    const c = journee(dossiers, [], seances, "2026-10-29");
    expect(c.map(x => x.dossier.label)).toEqual(["Lucie M.", "Marc D."]);
    expect(c[1].avenir?.texte).toBe("Travail excentrique");
    expect(c[1].avant?.id).toBe("2");
    expect(c[1].faite?.id).toBe("3");
    expect(c[0].faite).toBeNull();
    expect(prochaineJournee(dossiers, "2026-10-30")).toBe("2026-10-30");
    expect(prochaineJournee(dossiers, "2026-10-31")).toBeNull();
  });
});

describe("transmissions", () => {
  const D = (id: string, label: string, rdvs: { d: string; h: string; t?: "bilan" }[]) => ({ id, label, rdvs, homonyme: false, cree: "" });
  const dossiers = [
    D("a", "Marc D.", [{ d: "2026-11-05", h: "10:00" }, { d: "2026-11-03", h: "09:00" }, { d: "2026-10-20", h: "09:00" }]),
    D("b", "Lucie M.", [{ d: "2026-11-02", h: "08:20", t: "bilan" }]),
    D("c", "Paul G.", [{ d: "2026-11-20", h: "09:00" }])
  ];
  it("patients ayant rendez-vous dans la période, dans l'ordre du premier rendez-vous, avec leurs rendez-vous de la période", () => {
    const s = [{ id: "1", dossierId: "a", date: "2026-10-20", cree: "x", contenu: "renfo. Pour la prochaine séance tester la force" }];
    const t = transmissions(dossiers, [], s, "2026-11-02", "2026-11-08");
    expect(t.map(x => x.dossier.label)).toEqual(["Lucie M.", "Marc D."]);
    expect(t[1].rdvs.map(r => r.d)).toEqual(["2026-11-03", "2026-11-05"]);
    expect(t[1].avenir?.texte).toBe("Tester la force");
    expect(t[0].seances).toEqual([]);
  });
  it("jours travaillés sans aucun rendez-vous, et semaine prochaine", () => {
    expect(joursSansRdv(dossiers, HORAIRES_DEFAUT, "2026-11-02", "2026-11-08")).toEqual(["2026-11-04", "2026-11-06"]);
    expect(semaineProchaine("2026-10-30")).toEqual(["2026-11-02", "2026-11-08"]);
  });
});
