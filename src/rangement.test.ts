/* Règles de rangement communes à l'appareil et au PC (1.9.0) */
import { describe, expect, it } from "vitest";
import type { AnalyseSeance, SeanceDictee } from "./ia";
import { analyseSurDossier, patchAnalyse, placerSeance, rangerMorceaux, rouvrirApres } from "./rangement";
import { empreinteTexte, type Dossier, type Seance } from "./regles";

const vide: AnalyseSeance = { propre: "", resume: "", bref: "", rdvDate: "", rdvHeure: "", rdvDemi: "" };
const D = (o: Partial<Dossier> = {}): Dossier => ({ id: "d1", label: "Marc D.", rdvs: [], homonyme: false, cree: "x", ...o });
const S = (o: Partial<Seance> = {}): Seance => ({ id: "s1", dossierId: "d1", date: "2026-11-16", cree: "x", contenu: "douleur trois", ...o });
const jour = (iso: string) => "le " + iso;
let n = 0;
const opts = { nouvelId: () => "id" + ++n, cree: "2026-11-16T10:00:00Z", auj: "2026-11-16", jour };

describe("rangement du résultat de l'IA", () => {
  it("séance : mise au propre, résumé court et « À venir » avec l'empreinte du texte d'origine", () => {
    const se = S({ contenu: "douleur trois pour la prochaine séance tester la force" });
    const p = patchAnalyse(se, { ...vide, propre: "État : 3/10.", bref: "3/10", resume: "Tester la force." }, "Tester la force");
    expect(p).toEqual({ ia_ok: true, propre: "État : 3/10.", propre_source: empreinteTexte(se.contenu), bref: "3/10", bref_source: empreinteTexte(se.contenu), avenir_resume: "Tester la force.", avenir_source: empreinteTexte("Tester la force") });
  });

  it("dossier : rendez-vous dits posés (demi-journée de la séance), annulés proposés, objectifs proposés ; rien si ce n'est pas la dernière séance", () => {
    const d = D({ rdvs: [{ d: "2026-11-16", h: "", p: "pm" }, { d: "2026-11-20", h: "", p: "am" }] });
    const a = { ...vide, rdvDate: "2026-11-18", autres: [{ d: "2026-11-19", demi: "am" as const }], annules: ["2026-11-20"], objectifs: ["Courir 20 minutes"] };
    const r = analyseSurDossier(d, [S()], S(), a, "2026-11-16", jour);
    expect(r.dossier.rdvs).toEqual([{ d: "2026-11-16", h: "", p: "pm" }, { d: "2026-11-18", h: "", p: "pm" }, { d: "2026-11-19", h: "", p: "am" }, { d: "2026-11-20", h: "", p: "am" }]);
    expect(r.dossier.retirer).toEqual(["2026-11-20"]);
    expect(r.dossier.objectifs_propose).toEqual({ liste: ["Courir 20 minutes"], date: "2026-11-16" });
    expect(r.message).toBe("Rendez-vous repérés pour Marc D. : le 2026-11-18 après-midi, le 2026-11-19 matin. Rendez-vous dit annulé pour Marc D. : le 2026-11-20. À confirmer. Objectif dit pour Marc D. : à confirmer sur sa fiche.");
    const plusRecente = S({ id: "s2", date: "2026-11-17" });
    expect(analyseSurDossier(d, [S(), plusRecente], S(), a, "2026-11-16", jour)).toEqual({ dossier: d, message: null });
  });

  it("fin de traitement dite : dossier archivé ; une séance notée après la fin le rouvre", () => {
    const r = analyseSurDossier(D(), [S()], S(), { ...vide, fin: true }, "2026-11-16", jour);
    expect(r.dossier.fin).toBe("2026-11-16");
    expect(rouvrirApres(D({ fin: "2026-11-10" }), "2026-11-16").fin).toBeUndefined();
    expect(rouvrirApres(D({ fin: "2026-11-20" }), "2026-11-16").fin).toBe("2026-11-20");
  });

  it("dictée : rangée chez le seul patient qui convient, doute sinon ; le passage devient une séance analysée", () => {
    const marc = D({ rdvs: [{ d: "2026-11-16", h: "", p: "am" }] }), lea = D({ id: "d2", label: "Léa P." });
    const m = (nom: string | null, contenu: string): SeanceDictee => ({ ...vide, nom, contenu, propre: contenu.toUpperCase(), rdvDate: nom === "Léa" ? "2026-11-18" : "" });
    const r = rangerMorceaux([marc, lea], [], "2026-11-16", [m("Marc", "massage"), m("Léa", "mobilisations"), m("Paul", "marche")], opts);
    expect(r.ranges.map(x => [x.dossierId, x.prenomSeul])).toEqual([["d1", false], ["d2", true]]);
    expect(r.seances.map(s => [s.dossierId, s.contenu, s.propre, s.ia_ok])).toEqual([["d1", "massage", "MASSAGE", true], ["d2", "mobilisations", "MOBILISATIONS", true]]);
    expect(r.doutes.map(d => d.seance.nom)).toEqual(["Paul"]);
    expect(r.dossiers.find(d => d.id === "d2")!.rdvs).toEqual([{ d: "2026-11-18", h: "" }]);
    expect(r.rdvs).toEqual(["Rendez-vous repéré pour Léa P. : le 2026-11-18."]);
    const p = placerSeance(D({ fin: "2026-11-01" }), [], "2026-11-16", { ...vide, contenu: "reprise" }, opts);
    expect(p.dossier.fin).toBeUndefined();
  });
});
