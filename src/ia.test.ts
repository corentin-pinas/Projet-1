import { describe, expect, it } from "vitest";
import { analyserSeance, calendrier, contenuBilan, coutDollars, lireAnalyse, normaliserResume, promptSeance, resumerBilan, systemeBilan, type Appel } from "./ia";

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
    const r = await analyserSeance("cle", "2026-10-02", dictee, false, faux({ propre: null, resume: "Tester RE.", rdv_date: "2026-10-09", rdv_heure: "08:00" }));
    expect(r.donnees).toEqual({ propre: "", resume: "Tester RE.", rdvDate: "2026-10-09", rdvHeure: "08:00" });
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
