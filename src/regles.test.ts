import { describe, expect, it } from "vitest";
import {
  nettoyerVoix, sansRepetition, suiteDe, indiceVoix, demiSeance, questionRdv, seancesManquantes, sansSeanceCeJour, brefDe, journee, prochaineJournee, transmissions, joursSansRdv, semaineProchaine, HORAIRES_DEFAUT,
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

describe("prochain rendez-vous (choix de Corentin, 5 novembre 2026)", () => {
  const D = (rdvs: { d: string; h?: string; p?: "am" | "pm" }[], fin?: string) => ({ id: "d1", label: "Paul T.", rdvs: rdvs.map(r => ({ h: "", ...r })), homonyme: false, cree: "", ...(fin ? { fin } : {}) });
  const S = (date: string) => ({ id: "s" + date, dossierId: "d1", date, cree: "", contenu: "x" });

  it("demi-journée de la séance : celle du rendez-vous de ce jour-là", () => {
    expect(demiSeance(D([{ d: "2026-11-05", p: "pm" }]).rdvs, "2026-11-05")).toBe("pm");
    expect(demiSeance(D([{ d: "2026-11-05", h: "09:00" }]).rdvs, "2026-11-05")).toBe("am");
    expect(demiSeance(D([]).rdvs, "2026-11-05")).toBeNull();
  });

  it("la question est posée après la dernière séance sans rendez-vous prévu ensuite", () => {
    expect(questionRdv(D([{ d: "2026-11-05", p: "pm" }]), [S("2026-11-03"), S("2026-11-05")], "2026-11-05")).toBe("2026-11-05");
  });

  it("pas de question si un rendez-vous est prévu après la séance, si la fin du traitement est notée, ou si la séance est ancienne", () => {
    expect(questionRdv(D([{ d: "2026-11-12" }]), [S("2026-11-05")], "2026-11-05")).toBeNull();
    expect(questionRdv(D([], "2026-11-05"), [S("2026-11-05")], "2026-11-05")).toBeNull();
    expect(questionRdv(D([]), [S("2026-10-01")], "2026-11-05")).toBeNull();
    expect(questionRdv(D([]), [], "2026-11-05")).toBeNull();
  });

  it("une séance notée après la fin du traitement repose la question", () => {
    expect(questionRdv(D([], "2026-10-20"), [S("2026-11-04")], "2026-11-05")).toBe("2026-11-04");
  });
});

describe("séances manquantes (choix de Corentin, 5 novembre 2026)", () => {
  const D = (id: string, rdvs: string[], absences?: string[]) => ({ id, label: id, rdvs: rdvs.map(d => ({ d, h: "", p: "pm" as const })), homonyme: false, cree: "", ...(absences ? { absences } : {}) });
  const S = (dossierId: string, date: string) => ({ id: dossierId + date, dossierId, date, cree: "", contenu: "x" });

  it("rendez-vous passé de moins de 30 jours, sans séance ni absence : signalé, du plus récent au plus ancien", () => {
    const d = D("v", ["2026-11-04", "2026-10-30", "2026-10-28", "2026-09-01", "2026-11-05", "2026-11-12"], ["2026-10-28"]);
    expect(seancesManquantes(d, [S("v", "2026-10-30")], "2026-11-05")).toEqual([{ d: "2026-11-04", demi: "pm" }]);
  });

  it("après une dictée : les patients qui avaient rendez-vous ce jour-là sans séance rangée", () => {
    const dossiers = [D("m", ["2026-11-04"]), D("v", ["2026-11-04"]), D("a", ["2026-11-04"], ["2026-11-04"]), D("x", ["2026-11-05"])];
    expect(sansSeanceCeJour(dossiers, [S("m", "2026-11-04")], "2026-11-04").map(d => d.id)).toEqual(["v"]);
  });
});

describe("transcription en direct", () => {
  it("retire les phrases inventées par Whisper sur un silence, garde le reste", () => {
    expect(nettoyerVoix("Victor M., douleur 3 sur 10. Sous-titres réalisés par la communauté d'Amara.org")).toBe("Victor M., douleur 3 sur 10.");
    expect(nettoyerVoix("Merci d'avoir regardé cette vidéo !")).toBe("");
    expect(nettoyerVoix("  merci, on se revoit jeudi  ")).toBe("merci, on se revoit jeudi");
  });
  it("retire la fin du morceau précédent quand Whisper la recopie au début du suivant", () => {
    expect(sansRepetition("on a fait des pendulaires matin et soir", "des pendulaires matin et soir. Sylvie F., raide")).toBe("Sylvie F., raide");
    expect(sansRepetition("on a fait des pendulaires", "matin et soir")).toBe("matin et soir");
    expect(sansRepetition("douleur 3 sur 10", "sur 10 aussi")).toBe("sur 10 aussi");   // moins de 4 mots : gardé
  });
  it("donne à Whisper les patients du jour et la fin du texte précédent, sans doublon", () => {
    expect(indiceVoix([], "")).toBeNull();
    expect(indiceVoix(["Victor M.", "Victor M.", " Sylvie F. "], "début")).toEqual({ noms: ["Victor M.", "Sylvie F."], avant: "début" });
    const long = "mot ".repeat(100);
    const s = suiteDe(long);
    expect(s.length).toBeLessThanOrEqual(200);
    expect(s.startsWith("mot")).toBe(true);
  });
});

describe("empreinte du texte d'origine (A5)", () => {
  it("la mise au propre reste valable avec l'empreinte comme avec l'ancienne copie complète ; un texte modifié l'invalide", async () => {
    const { empreinteTexte, memeSource } = await import("./regles");
    expect(memeSource(empreinteTexte("douleur 3 sur 10"), "douleur 3 sur 10")).toBe(true);
    expect(memeSource("douleur 3 sur 10", "douleur 3 sur 10")).toBe(true);                 // séances d'avant
    expect(memeSource(empreinteTexte("douleur 3 sur 10"), "douleur 4 sur 10")).toBe(false);
    expect(empreinteTexte("x".repeat(5000)).length).toBeLessThan(30);
  });
});

describe("archivage (1.5.2)", () => {
  it("un patient avec une fin de traitement est archivé ; un rendez-vous posé après la fin le fait revenir", async () => {
    const { estArchive } = await import("./regles");
    expect(estArchive(dossier({ fin: "2026-11-01" }))).toBe(true);
    expect(estArchive(dossier({ fin: "2026-11-01", rdvs: [{ d: "2026-10-20", h: "" }] }))).toBe(true);
    expect(estArchive(dossier({ fin: "2026-11-01", rdvs: [{ d: "2026-11-15", h: "" }] }))).toBe(false);
    expect(estArchive(dossier({}))).toBe(false);
  });
  it("la liste cache les archivés ; une recherche les montre après les patients en soins", () => {
    const enSoins = dossier({ id: "a", label: "Marc D." }), archive = dossier({ id: "b", label: "Marc Du.", fin: "2026-03-12" });
    expect(lignesListe([archive, enSoins], [], "", "2026-11-08").map(l => l.dossier.id)).toEqual(["a"]);
    const l = lignesListe([archive, enSoins], [], "marc d", "2026-11-08");
    expect(l.map(x => [x.dossier.id, x.archive])).toEqual([["a", false], ["b", true]]);
  });
  it("dictée : un patient archivé n'est jamais choisi tout seul ; s'il est le seul de ce nom, c'est une question", () => {
    const archive = dossier({ id: "b", label: "Lucie M.", fin: "2026-03-12" }), autre = dossier({ id: "c", label: "Paul T." });
    expect(rattacher("Lucie", [archive, autre], "2026-11-08")).toEqual({ dossier: null, candidats: [archive] });
    const enSoins = dossier({ id: "a", label: "Lucie M." });
    expect(rattacher("Lucie", [archive, enSoins], "2026-11-08").dossier?.id).toBe("a");
  });
});

describe("alerte « sans rendez-vous » (1.5.2)", () => {
  it("30 jours sans rien et sans rendez-vous à venir : alerte ; 3 mois : proposition d'archiver ; archivés et patients avec rendez-vous à venir : jamais", async () => {
    const { sansRendezVous } = await import("./regles");
    const auj = "2026-11-08";
    const recent = dossier({ id: "r", cree: "2026-10-20T10:00:00Z" });
    const oublie = dossier({ id: "o", cree: "2026-09-01T10:00:00Z", rdvs: [{ d: "2026-10-01", h: "" }] });
    const ancien = dossier({ id: "x", cree: "2026-06-01T10:00:00Z" });
    const avenir = dossier({ id: "v", cree: "2026-06-01T10:00:00Z", rdvs: [{ d: "2026-11-20", h: "" }] });
    const archive = dossier({ id: "z", cree: "2026-06-01T10:00:00Z", fin: "2026-06-10" });
    const l = sansRendezVous([recent, oublie, ancien, avenir, archive], [], [seance({ dossierId: "o", date: "2026-10-01" })], auj);
    expect(l.map(x => [x.dossier.id, x.depuis, x.archiver])).toEqual([["x", "2026-06-01", true], ["o", "2026-10-01", false]]);
  });
  it("« C'est normal » fait taire l'alerte 30 jours", async () => {
    const { sansRendezVous } = await import("./regles");
    const d = dossier({ id: "o", cree: "2026-09-01T10:00:00Z", calme: "2026-11-01" });
    expect(sansRendezVous([d], [], [], "2026-11-08")).toEqual([]);
    expect(sansRendezVous([d], [], [], "2026-12-05")).toHaveLength(1);
  });
});

/* plusieurs rendez-vous dictés d'un coup, rendez-vous dits annulés (choix de Corentin du 11 novembre 2026) */
import { aRetirer, poserRdvs } from "./regles";
describe("poserRdvs", () => {
  it("pose chaque jour dit, avec la demi-journée de la séance quand elle n'est pas dite", () => {
    const l = poserRdvs([], [{ d: "2026-11-10", h: "", demi: "" }, { d: "2026-11-12", h: "", demi: "pm" }, { d: "2026-11-16", h: "", demi: "" }], "am");
    expect(l.map(r => [r.d, r.p])).toEqual([["2026-11-10", "am"], ["2026-11-12", "pm"], ["2026-11-16", "am"]]);
  });
  it("redonner les mêmes jours ne crée aucun doublon ; un jour déjà posé ne change que si matin ou après-midi est dit", () => {
    const avant = poserRdvs([], [{ d: "2026-11-12", h: "", demi: "pm" }, { d: "2026-11-16", h: "", demi: "" }], "am");
    const apres = poserRdvs(avant, [{ d: "2026-11-12", h: "", demi: "" }, { d: "2026-11-16", h: "", demi: "pm" }, { d: "2026-11-17", h: "", demi: "" }], "am");
    expect(apres.map(r => [r.d, r.p])).toEqual([["2026-11-12", "pm"], ["2026-11-16", "pm"], ["2026-11-17", "am"]]);
  });
  it("garde le type « bilan » d'un rendez-vous déjà posé", () => {
    const l = poserRdvs([{ d: "2026-11-12", h: "", t: "bilan", p: "am" }], [{ d: "2026-11-12", h: "", demi: "pm" }], null);
    expect(l).toEqual([{ d: "2026-11-12", h: "", t: "bilan", p: "pm" }]);
  });
});
describe("aRetirer", () => {
  it("ne propose que les rendez-vous dits annulés, encore posés et à venir", () => {
    const D = { id: "p", label: "Philippe D.", rdvs: [{ d: "2026-11-05", h: "" }, { d: "2026-11-12", h: "" }], homonyme: false, cree: "", retirer: ["2026-11-05", "2026-11-12", "2026-11-12", "2026-11-19"] };
    expect(aRetirer(D, "2026-11-10")).toEqual(["2026-11-12"]);
  });
});


/* objectifs du patient (choix de Corentin du 12 novembre 2026) */
import { avecObjectifs, objectifsDe } from "./regles";
describe("objectifs du patient", () => {
  const D = { id: "p", label: "Paul G.", rdvs: [], homonyme: false, cree: "" };
  const bilan = (ajoute: string, resume: object) => ({ id: "b" + ajoute, dossierId: "p", fichier: "f", fichiers: [], ajoute, valides: [], corrections: [], resume });
  it("au départ, ceux du bilan le plus récent : champ objectifs, sinon la rubrique « Objectifs »", () => {
    expect(objectifsDe(D, [])).toBeNull();
    expect(objectifsDe(D, [bilan("2026-10-01", { sections: [{ titre: "Objectifs SMART", items: ["Se coiffer"] }] })]))
      .toEqual({ liste: ["Se coiffer"], maj: "2026-10-01", source: "bilan" });
    expect(objectifsDe(D, [bilan("2026-10-01", { objectifs: ["Ancien"] }), bilan("2026-11-01", { objectifs: ["Courir 20 min"] })])?.liste).toEqual(["Courir 20 min"]);
  });
  it("ceux du dossier passent avant le bilan ; vidés à la main, il n'y en a plus", () => {
    const b = [bilan("2026-10-01", { objectifs: ["Se coiffer"] })];
    const modifie = avecObjectifs(D, ["Tennis en mars ", "", "Tennis en mars"], "main", "2026-11-12T10:00:00Z", objectifsDe(D, b));
    expect(objectifsDe(modifie, b)).toEqual({ liste: ["Tennis en mars"], maj: "2026-11-12T10:00:00Z", source: "main" });
    expect(modifie.objectifs_hist).toEqual([{ liste: ["Se coiffer"], maj: "2026-10-01", source: "bilan" }]);
    const vide = avecObjectifs(modifie, [], "main", "2026-11-13T10:00:00Z", objectifsDe(modifie, b));
    expect(objectifsDe(vide, b)).toBeNull();
    expect(vide.objectifs_hist?.length).toBe(2);
  });
});


/* transmissions : ce qui est gardé (choix de Corentin du 12 novembre 2026) */
import { rubriquesTransmission, seanceTransmission } from "./regles";
describe("ce que gardent les transmissions", () => {
  it("rubriques du bilan : identité, diagnostic, EVA ; pas l'histoire clinique, les flags, les objectifs", () => {
    const r = { sections: ["Identité", "Histoire clinique", "Anamnèse", "Diagnostic médical", "Red flags", "Yellow flags", "Drapeaux jaunes", "EVA", "Objectifs SMART", "Examen"]
      .map(titre => ({ titre, items: ["x"] })) };
    expect(rubriquesTransmission(r).map(s => s.titre)).toEqual(["Identité", "Diagnostic médical", "EVA"]);
  });
  it("dernière séance mise au propre, sans la ligne « À venir »", () => {
    const s = { id: "1", dossierId: "p", date: "2026-11-10", cree: "", contenu: "x", propre_source: "x", propre: "État du patient : douleur 3/10.\nFait en séance : renfo.\nÀ venir : excentrique." };
    expect(seanceTransmission(s)).toBe("État du patient : douleur 3/10.\nFait en séance : renfo.");
  });
});
