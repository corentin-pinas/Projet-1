/* Rangement du résultat de l'IA (1.9.0) : ce que devient une séance analysée (mise au propre, « À venir », rendez-vous
   dits, rendez-vous annulés, objectifs proposés, fin de traitement) et où vont les passages d'une dictée groupée.
   Fonctions pures, communes à l'appareil (moteur.ts) et au PC (src/pc/travail.ts, qui fait le travail en tâche de fond) :
   les mêmes règles, où que le travail soit fait. Elles reprennent à l'identique celles de moteur.ts avant la 1.9.0. */
import type { AnalyseSeance, SeanceDictee } from "./ia";
import { zonesDeSeance } from "./corps";
import { avenirFrom, DEMI_FR, demiDe, demiSeance, empreinteTexte, memeSource, poserRdvs, rattacher, type Dossier, type Seance } from "./regles";

/* libellé d'un jour dans les messages : « demain », « jeudi » sur l'appareil ; « jeudi 20 novembre » sur le PC (le message
   est lu plus tard) */
export type Jour = (iso: string) => string;

/* un passage que Muninn n'a pas pu ranger seul : Corentin choisit le dossier parmi les candidats */
export type Doute = { id: string; date: string; seance: SeanceDictee; candidats: string[] };
/* prenomSeul : rangé d'après le nom seul, sans rendez-vous ce jour-là (audit F11) : le récapitulatif le signale */
export type Range = { seanceId: string; dossierId: string; prenomSeul?: boolean };

/* ce qui change dans la séance elle-même ; l'empreinte du texte d'origine, pas sa copie (audit A5) */
export function patchAnalyse(se: Seance, a: AnalyseSeance, brut: string): Partial<Seance> {
  const patch: Partial<Seance> = { ia_ok: true };
  if (brut && a.resume) { patch.avenir_resume = a.resume; patch.avenir_source = empreinteTexte(brut); }
  if (a.propre) { patch.propre = a.propre; patch.propre_source = empreinteTexte(se.contenu); }
  if (a.bref) { patch.bref = a.bref; patch.bref_source = empreinteTexte(se.contenu); }
  /* relevé du suivi (2.2.0) : un relevé vérifié ou corrigé par Corentin pour ce même texte n'est jamais écrasé */
  if (a.releves && !(se.releves_main && memeSource(se.releves_source, se.contenu))) {
    patch.releves = a.releves; patch.releves_source = empreinteTexte(se.contenu);
    if (se.releves_main) patch.releves_main = false;
  }
  return patch;
}

/* Ce qui change dans le dossier : seulement si cette séance est la dernière du patient (seances : toutes, elle comprise).
   Rend le dossier (le même objet si rien ne change) et le message à montrer. */
export function analyseSurDossier(d: Dossier, seances: Seance[], se: Seance, a: AnalyseSeance, auj: string, jour: Jour): { dossier: Dossier; message: string | null } {
  const derniere = !seances.some(x => x.dossierId === se.dossierId && x.id !== se.id && x.date > se.date);
  if (!derniere) return { dossier: d, message: null };
  /* « dernière séance », « fin de traitement » dit dans la dictée : fin notée, le dossier est archivé (choix du 8 novembre 2026) */
  if (a.fin) return { dossier: { ...d, fin: se.date }, message: "Fin de traitement notée pour " + d.label + " : dossier archivé (« Rouvrir le dossier » sur sa fiche en cas d'erreur)." };
  let D = d;
  const messages: string[] = [];
  /* tous les rendez-vous dits (choix de Corentin du 11 novembre 2026) ; matin ou après-midi pas dit : même demi-journée
     que la séance (5 novembre 2026) ; les rendez-vous passés sont gardés (historique, futures absences) */
  const dictes = [...(a.rdvDate ? [{ d: a.rdvDate, h: a.rdvHeure, demi: a.rdvDemi }] : []), ...(a.autres ?? []).map(x => ({ d: x.d, h: "", demi: x.demi }))]
    .filter(x => x.d >= auj);
  if (dictes.length) {
    const rdvs = poserRdvs(d.rdvs ?? [], dictes, demiSeance(d.rdvs ?? [], se.date));
    D = { ...D, rdvs };
    // un jour redonné n'est plus à proposer au retrait
    if (d.retirer?.some(j => dictes.some(x => x.d === j))) D = { ...D, retirer: (d.retirer ?? []).filter(j => !dictes.some(x => x.d === j)) };
    const jours = dictes.map(x => { const r = rdvs.find(y => y.d === x.d), dm = r ? demiDe(r) : null; return jour(x.d) + (dm ? " " + DEMI_FR[dm] : ""); });
    messages.push((jours.length > 1 ? "Rendez-vous repérés pour " : "Rendez-vous repéré pour ") + d.label + " : " + jours.join(", ") + ".");
  }
  /* rendez-vous dits annulés : jamais retirés tout seuls, Muninn propose de les enlever (fiche et récapitulatif) */
  const annules = (a.annules ?? []).filter(j => j >= auj && (d.rdvs ?? []).some(r => r.d === j));
  if (annules.length) {
    D = { ...D, retirer: [...new Set([...(D.retirer ?? []), ...annules])] };
    messages.push("Rendez-vous dit annulé pour " + d.label + " : " + annules.map(jour).join(", ") + ". À confirmer.");
  }
  /* objectifs dits dans la dictée (2.1.0, choix de Corentin du 22 novembre 2026) : ajoutés tout seuls, jamais à la place
     des anciens ; corrigeables avec « Modifier » sur la fiche */
  if (a.objectifs?.length) {
    const deja = new Set((D.objectifs_dictes ?? []).map(o => o.t.toLowerCase()));
    const neufs = a.objectifs.filter(t => !deja.has(t.toLowerCase()));
    if (neufs.length) {
      D = { ...D, objectifs_dictes: [...(D.objectifs_dictes ?? []), ...neufs.map(t => ({ t, date: se.date }))] };
      messages.push((neufs.length > 1 ? "Objectifs ajoutés pour " : "Objectif ajouté pour ") + d.label + " : " + neufs.join(" ; ") + ".");
    }
  }
  /* zones de la carte du corps dites dans la séance (2.1.0) : ajoutées, pâlies ou passées dans les anciennes */
  if (a.zones?.length) {
    const zones = zonesDeSeance(D.zones, a.zones, se.date, se.cree);
    if (JSON.stringify(zones) !== JSON.stringify(D.zones ?? [])) D = { ...D, zones };
  }
  return { dossier: D, message: messages.length ? messages.join(" ") : null };
}

/* une séance notée après la fin de traitement : le patient revient, son dossier n'est plus archivé */
export function rouvrirApres(d: Dossier, date: string): Dossier {
  if (!d.fin || date <= d.fin) return d;
  const { fin: _, ...reste } = d;
  return reste;
}

export type Options = { nouvelId: () => string; cree: string; origine?: string; auj: string; jour: Jour };
export type Absent = { dossierId: string; date: string };
export type Resultat = { seances: Seance[]; dossiers: Dossier[]; ranges: Range[]; doutes: Doute[]; rdvs: string[]; absents: Absent[] };
/* absence notée (dite dans la dictée) : le jour rejoint les absences du dossier */
export const messageAbsence = (label: string) => "Absence notée pour " + label.replace(/\.?$/, ".");
export const avecAbsence = (d: Dossier, date: string): Dossier => ({ ...d, absences: [...new Set([...(d.absences ?? []), date])].sort() });

/* Une dictée groupée découpée par l'IA, rangée patient par patient : automatiquement quand un seul dossier convient (règle de
   rattacher, sur l'état d'avant la dictée), sinon le passage devient un doute. Rend les séances créées, les dossiers changés
   (dans leur dernière version), les passages rangés, les doutes et les messages des rendez-vous. */
export function rangerMorceaux(dossiers: Dossier[], seances: Seance[], date: string, morceaux: SeanceDictee[], o: Options): Resultat {
  const parId = new Map(dossiers.map(d => [d.id, d] as const));
  const changes = new Set<string>();
  const toutes = [...seances];
  const r: Resultat = { seances: [], dossiers: [], ranges: [], doutes: [], rdvs: [], absents: [] };
  for (const m of morceaux) {
    const { dossier, candidats } = rattacher(m.nom, dossiers, date);
    if (!dossier) { r.doutes.push({ id: o.nouvelId(), date, seance: m, candidats: candidats.map(d => d.id) }); continue; }
    if (m.absent) {
      parId.set(dossier.id, avecAbsence(parId.get(dossier.id)!, date)); changes.add(dossier.id);
      r.absents.push({ dossierId: dossier.id, date }); r.rdvs.push(messageAbsence(dossier.label));
      continue;
    }
    const placee = placerSeance(parId.get(dossier.id)!, toutes, date, m, o);
    parId.set(dossier.id, placee.dossier); changes.add(dossier.id);
    toutes.push(placee.seance); r.seances.push(placee.seance);
    r.ranges.push({ seanceId: placee.seance.id, dossierId: dossier.id, prenomSeul: !dossier.rdvs.some(x => x && x.d === date) });
    if (placee.message) r.rdvs.push(placee.message);
  }
  r.dossiers = [...changes].map(id => parId.get(id)!);
  return r;
}

/* un passage (de dictée ou une séance dite à la voix) devient une séance du dossier, analysée */
export function placerSeance(d: Dossier, seances: Seance[], date: string, m: AnalyseSeance & { contenu: string }, o: Options): { seance: Seance; dossier: Dossier; message: string | null } {
  const brute: Seance = { id: o.nouvelId(), dossierId: d.id, date, contenu: m.contenu, cree: o.cree, ...(o.origine ? { origine: o.origine } : {}) };
  const seance = { ...brute, ...patchAnalyse(brute, m, avenirFrom(m.contenu)) };
  const { dossier, message } = analyseSurDossier(rouvrirApres(d, date), [...seances, seance], seance, m, o.auj, o.jour);
  return { seance, dossier, message };
}
