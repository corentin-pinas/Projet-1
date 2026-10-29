import { describe, expect, it } from "vitest";
import { analyserSeance, corrigerResume, promptCorrection, calendrier, decouperDictee, lireDictee, promptDictee, contenuBilan, coutDollars, lireAnalyse, normaliserResume, promptSeance, resumerBilan, systemeBilan, type Appel } from "./ia";

const faux = (donnees: unknown): Appel => async () => ({ donnees, usage: { entree: 1000, sortie: 500 } });

describe("calendrier donné à l'IA", () => {
  it("liste les jours avec leur date exacte, sans calcul à faire", () => {
    const c = calendrier("2026-10-02", 0, 7).split("\n");
    expect(c[0]).toBe("J : vendredi 2 octobre 2026 = 2026-10-02");
    expect(c[7]).toBe("J+7 : vendredi 9 octobre 2026 = 2026-10-09");
  });
});

describe("analyse d'une séance", () => {
  const dictee = "euh le patient dit que ça va mieux douleur à trois sur dix on a fait du renforcement des rotateurs externes pour la prochaine séance tester la force en rotation externe dans une semaine à 8 heures";

  it("reprend les consignes de la version d'essai", () => {
    const p = promptSeance("2026-10-02", dictee, false);
    expect(p).toContain("n'ajoute aucune information");
    expect(p).toContain("« État du patient »");
    expect(p).toContain("J+7 : vendredi 9 octobre 2026 = 2026-10-09");
    expect(p).toContain("Prévu :\nTester la force");
    expect(promptSeance("2026-10-02", dictee, true)).toContain('"propre" : null');
  });

  it("rejette une mise au propre beaucoup plus courte que la dictée", () => {
    expect(lireAnalyse({ propre: "Trop court." }, dictee, false).propre).toBe("");
    const ok = "État du patient : va mieux, douleur 3/10.\nFait en séance : renforcement des rotateurs externes.\nÀ venir : tester la force en rotation externe, dans une semaine à 8 h.";
    expect(lireAnalyse({ propre: ok }, dictee, false).propre).toBe(ok);
  });

  it("ne garde une date de rendez-vous que si elle est bien formée, et l'heure seulement avec une date", () => {
    expect(lireAnalyse({ rdv_date: "2026-10-09", rdv_heure: "8h00" }, dictee, false)).toMatchObject({ rdvDate: "2026-10-09", rdvHeure: "08:00" });
    expect(lireAnalyse({ rdv_date: "vendredi", rdv_heure: "08:00" }, dictee, false)).toMatchObject({ rdvDate: "", rdvHeure: "" });
    expect(lireAnalyse({ rdv_date: "2026-10-09", rdv_heure: "25:00" }, dictee, false).rdvHeure).toBe("");
  });

  it("nettoie le résumé « À venir », et l'ignore s'il n'y a pas de passage « prochaine séance »", () => {
    expect(lireAnalyse({ resume: "« À venir : Tester la force RE. »" }, dictee, false).resume).toBe("Tester la force RE.");
    expect(lireAnalyse({ resume: "Tester" }, "massage, rien d'autre", false).resume).toBe("");
  });

  it("n'utilise jamais la mise au propre quand le texte a été corrigé à la main", () => {
    expect(lireAnalyse({ propre: dictee }, dictee, true).propre).toBe("");
  });

  it("renvoie l'analyse et la consommation", async () => {
    const r = await analyserSeance("cle", "2026-10-02", dictee, false, faux({ propre: null, resume: "Tester RE.", bref: "Douleur 3/10. Pendulaires.", rdv_date: "2026-10-09", rdv_heure: "08:00" }));
    expect(r.donnees).toEqual({ propre: "", resume: "Tester RE.", bref: "Douleur 3/10. Pendulaires.", rdvDate: "2026-10-09", rdvHeure: "08:00" });
    expect(r.usage).toEqual({ entree: 1000, sortie: 500 });
  });
});

describe("résumé d'un bilan", () => {
  it("envoie un PDF comme document et des photos comme images", () => {
    const c = contenuBilan([{ type: "application/pdf", donnees: "QUJD" }]);
    expect(c[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
    const p = contenuBilan([{ type: "image/jpeg", donnees: "a" }, { type: "image/jpeg", donnees: "b" }]);
    expect(p.filter(b => b.type === "image")).toHaveLength(2);
    expect(p.at(-1)).toMatchObject({ type: "text" });
  });

  it("joint le texte tapé de la trame, en précisant qu'il ne contient pas l'écriture au stylet", () => {
    const c = contenuBilan([{ type: "image/jpeg", donnees: "a" }, { type: "text/plain", donnees: "Page 1 : BILAN ÉPAULE EVA ___" }]);
    expect(c.filter(b => b.type === "image")).toHaveLength(1);
    expect(c[1]).toMatchObject({ type: "text" });
    expect((c[1] as { text: string }).text).toContain("sans l'écriture au stylet");
    expect((c[1] as { text: string }).text).toContain("BILAN ÉPAULE");
  });

  it("rappelle les règles de confidentialité et les conventions manuscrites", () => {
    const s = systemeBilan([]);
    expect(s).toContain("prénom et première lettre du nom uniquement");
    expect(s).toContain("sa spécialité seulement");
    expect(s).toContain("« + » entouré = test positif");
  });

  it("transmet les corrections déjà faites par le kiné", () => {
    expect(systemeBilan([{ point: "RE2 30°", correction: "RE2 50°" }])).toContain("Lu « RE2 30° » ; correction : « RE2 50° »");
  });

  it("nettoie une réponse imparfaite", () => {
    const r = normaliserResume({ region: " Épaule D ", date_bilan: "2026-09-18", age: 52.4, coup_oeil: "Douleur.", chiffres: [{ label: "EVA", valeur: "5/10" }, { label: "", valeur: "x" }], sections: [{ titre: "Examen", items: ["Jobe +", ""] }, { titre: "Vide", items: [] }], a_verifier: "pas une liste" });
    expect(r).toEqual({ region: "Épaule D", date_bilan: "", age: 52, coup_oeil: "Douleur.", chiffres: [{ label: "EVA", valeur: "5/10" }], sections: [{ titre: "Examen", items: ["Jobe +"] }], a_verifier: [] });
  });

  it("refuse un résumé vide", async () => {
    await expect(resumerBilan("cle", [{ type: "application/pdf", donnees: "x" }], [], faux({}))).rejects.toThrow("rien pu lire");
  });

  it("prend l'IA la plus puissante pour les bilans et une plus légère pour les séances", async () => {
    const niveaux: string[] = [];
    const espion: Appel = async req => { niveaux.push(req.niveau); return { donnees: { coup_oeil: "x", propre: null, resume: null, rdv_date: null, rdv_heure: null }, usage: { entree: 0, sortie: 0 } }; };
    await resumerBilan("cle", [{ type: "image/jpeg", donnees: "x" }], [], espion);
    await analyserSeance("cle", "2026-10-02", "massage", false, espion);
    expect(niveaux).toEqual(["puissant", "leger"]);
  });

  it("calcule le coût en dollars", () => {
    expect(coutDollars({ entree: 1_000_000, sortie: 100_000 })).toBeCloseTo(6);
  });
});

describe("dictée groupée", () => {
  const dictee = "avec marque D douleur 3 sur 10 renforcement des rotateurs externes pour la prochaine séance tester la force ensuite Élisabeth G massage cervical et étirements";
  const reponse = { seances: [
    { nom: "Marc D.", extrait: "douleur 3 sur 10 renforcement des rotateurs externes pour la prochaine séance tester la force", propre: "État du patient : douleur 3/10.\nFait en séance : renforcement des rotateurs externes.\nÀ venir : tester la force.", resume: "Tester la force.", rdv_date: null, rdv_heure: null },
    { nom: "Élisabeth G.", extrait: "massage cervical et étirements", propre: "Fait en séance : massage cervical et étirements.", resume: "Inventé", rdv_date: null, rdv_heure: null }
  ] };

  it("le prompt donne les patients, ceux vus ce jour-là, le calendrier et les règles de mise au propre", () => {
    const p = promptDictee("2026-10-26", dictee, [{ label: "Marc D.", vuCeJour: true }, { label: "Élisabeth G.", vuCeJour: false }]);
    expect(p).toContain("- Marc D. (rendez-vous ce jour-là)\n- Élisabeth G.\n");
    expect(p).toContain("J+7 : lundi 2 novembre 2026 = 2026-11-02");
    expect(p).toContain("n'ajoute aucune information");
    expect(p).toContain("Jamais de nom de famille complet");
  });

  it("lit une séance par patient, avec les garde-fous d'une séance seule", () => {
    const s = lireDictee(reponse, dictee);
    expect(s.map(x => x.nom)).toEqual(["Marc D.", "Élisabeth G."]);
    expect(s[0].propre).toContain("À venir : tester la force.");
    expect(s[0].resume).toBe("Tester la force.");
    expect(s[1].resume).toBe("");   // pas de « pour la prochaine séance » dans son extrait : rien d'inventé
  });

  it("refuse tout si une partie de la dictée a été perdue", () => {
    expect(() => lireDictee({ seances: [reponse.seances[1]] }, dictee)).toThrow("laissé de côté");
    expect(() => lireDictee({}, dictee)).toThrow();
  });

  it("passe par l'IA la plus puissante, en une seule demande", async () => {
    const appels: Parameters<Appel>[0][] = [];
    const appel: Appel = async req => { appels.push(req); return { donnees: reponse, usage: { entree: 1, sortie: 1 } }; };
    const r = await decouperDictee("cle", "2026-10-26", dictee, [], appel);
    expect(r.donnees).toHaveLength(2);
    expect(appels).toHaveLength(1);
    expect(appels[0].niveau).toBe("puissant");
  });
});

describe("correction reportée dans le résumé", () => {
  const resume = {
    region: "Épaule D", date_bilan: "12/10/2028", age: 52, coup_oeil: "Douleur antérieure depuis 2 mois.",
    chiffres: [{ label: "EVA", valeur: "5/10" }], sections: [{ titre: "Examen", items: ["Jobe +", "RE2 30°"] }],
    a_verifier: ["Autre point encore à vérifier"]
  };
  const corr = [{ point: "Date lue 12/10/2028 : le 6 est peut-être mal écrit", correction: "12/10/2026" }];

  it("le prompt donne le résumé, le point et la réponse du kiné, et interdit tout autre changement", () => {
    const p = promptCorrection(resume, corr);
    expect(p).toContain('"date_bilan":"12/10/2028"');
    expect(p).toContain("réponse du kiné : « 12/10/2026 »");
    expect(p).toContain("Ne change rien d'autre");
  });

  it("garde le résumé corrigé, avec les points encore à vérifier, par l'IA légère", async () => {
    let niveau = "";
    const appel: Appel = async req => { niveau = req.niveau; return { donnees: { ...resume, date_bilan: "12/10/2026", a_verifier: [] }, usage: { entree: 1, sortie: 1 } }; };
    const r = await corrigerResume("cle", resume, corr, appel);
    expect(r.donnees.date_bilan).toBe("12/10/2026");
    expect(r.donnees.sections).toEqual(resume.sections);
    expect(r.donnees.a_verifier).toEqual(["Autre point encore à vérifier"]);
    expect(niveau).toBe("leger");
  });

  it("refuse un résumé corrigé qui a perdu des informations", async () => {
    const appel: Appel = async () => ({ donnees: { ...resume, date_bilan: "12/10/2026", sections: [], chiffres: [] }, usage: { entree: 1, sortie: 1 } });
    await expect(corrigerResume("cle", resume, corr, appel)).rejects.toThrow("pas pu être reportée");
  });
});
