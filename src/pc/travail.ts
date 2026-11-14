/* Le PC fait le travail en tâche de fond (1.9.0, choix de Corentin du 14 novembre 2026).
   Un appareil (téléphone, tablette) envoie au PC une dictée groupée, une séance dite à la voix ou une séance à mettre au
   propre, puis peut fermer Muninn. Le PC, toujours allumé, transcrit la voix (Whisper du PC), demande le travail à l'IA
   (par le serveur de l'appli, comme les appareils), range le résultat dans la base commune et réessaie seul en cas d'échec,
   même la nuit. Les appareils reçoivent le résultat au partage suivant, comme un changement fait sur un autre appareil.
   Les travaux et leur état sont un élément partagé (parametres/travaux) : chaque appareil voit où ils en sont, le
   récapitulatif de la dictée et ses passages à ranger.

   Ce fichier est construit (npm run pc) en public/pc/travail.mjs, chargé par muninn-pc.mjs, qui lui donne accès à la base
   (transaction), aux enregistrements reçus, à Whisper et à l'adresse du serveur de l'appli. Les consignes données à l'IA et
   les règles de rangement sont celles de l'appli (ia.ts, rangement.ts, regles.ts) : les mêmes, où que le travail soit fait. */
import { analyserSeance, appelAbonnementVers, decouperDictee, ErreurIA, natureDe, type Appel } from "../ia";
import { analyseSurDossier, patchAnalyse, rangerMorceaux, rouvrirApres, type Doute, type Range } from "../rangement";
import { avenirFrom, empreinteTexte, estArchive, indiceVoix, isoDay, jourLong, nettoyerVoix, rdvsDuJour, type DicteeGardee, type Dossier, type Rdv, type Seance } from "../regles";

export const VERSION = 1;

/* ---------- les travaux ---------- */

export type TypeTravail = "dictee" | "seance" | "analyse";
export type Demande = {
  id: string;                 // choisi par l'appareil : la même demande envoyée deux fois ne fait qu'un travail
  type: TypeTravail;          // dictée groupée ; séance d'une fiche dite à la voix ; mise au propre d'une séance enregistrée
  date: string;               // jour des séances (AAAA-MM-JJ)
  appareil?: string;          // appareil qui l'a envoyée (c'est lui qui annonce le résultat)
  texte?: string;             // dictée tapée ou transcrite en direct ; sinon le son est joint
  debut?: string;             // texte tapé avant l'enregistrement, mis devant la transcription
  dossierId?: string;         // séance d'une fiche
  seanceId?: string;          // séance à mettre au propre (et, après la transcription, la séance créée)
  empreinte?: string;         // empreinte du texte de cette séance à l'envoi : modifiée depuis, le travail n'a plus lieu d'être
  sansPropre?: boolean;       // texte corrigé à la main : pas de mise au propre (rendez-vous, « À venir » seulement)
};
/* attente : à faire (prochain : pas avant) ; transcription, rangement : en cours ; fini ; erreur : relancer ne changerait rien,
   ou trop d'essais (Corentin peut « Réessayer ») */
export type Etat = "attente" | "transcription" | "rangement" | "fini" | "erreur";
export type Travail = Demande & {
  cree: string; etat: Etat; essais: number; prochain?: string; erreur?: string; son?: boolean; fini?: string;
  // résultat d'une dictée : séances rangées, passages à ranger à la main, messages, rendez-vous avant et après (pour « Annuler »)
  ranges?: Range[]; doutes?: Doute[]; rdvs?: string[]; rdvs_avant?: Record<string, Rdv[]>; rdvs_apres?: Record<string, Rdv[]>; crees?: string[];
  vu?: boolean;               // récapitulatif refermé (« Nouvelle dictée »)
  local?: boolean;            // fait sur l'appareil (PC injoignable), gardé ici pour le récapitulatif
};
export const CLE = "parametres/travaux";
export type ValeurTravaux = { travaux: Travail[] };

export const ESSAIS_MAX = 24;
/* nouvel essai : 5 min, 15 min, 30 min, puis toutes les heures (24 essais : une journée) */
export const delaiEssai = (essais: number) => [5, 15, 30][essais - 1] ?? 60;
const ARRIVEE_MAX_MS = 15 * 60_000;   // une séance à mettre au propre pas encore arrivée sur le PC : attendue 15 minutes
const GARDE_JOURS = 14, GARDES_MAX = 40;

const enCours = (t: Travail) => t.etat === "attente" || t.etat === "transcription" || t.etat === "rangement";

/* travaux finis gardés 14 jours (40 au plus) ; ceux qui ont encore des passages à ranger restent */
export function elaguer(liste: Travail[], maintenant: Date): Travail[] {
  const limite = new Date(maintenant.getTime() - GARDE_JOURS * 864e5).toISOString();
  const tri = [...liste].sort((a, b) => b.cree.localeCompare(a.cree));
  let gardes = 0;
  return tri.filter(t => enCours(t) || t.doutes?.length || (t.cree >= limite && ++gardes <= GARDES_MAX)).reverse();
}

/* ---------- ce que muninn-pc.mjs donne au travail ---------- */

export type Lecture = { lire: (cle: string) => unknown; liste: (prefixe: string) => unknown[] };
export type Ecriture = { cle: string; valeur: unknown };
export type Son = { octets: Uint8Array; type: string };
export type Env = Lecture & {
  /* f lit l'état du moment et rend ce qu'il faut écrire ; tout est écrit d'un coup (rien à moitié si le PC s'arrête) */
  transaction: (f: (l: Lecture) => Ecriture[]) => Promise<void>;
  transcrire: (son: Son, indice: string) => Promise<string>;   // erreur : { message, nature }
  sons: { garder: (id: string, son: Son) => Promise<void>; lire: (id: string) => Promise<Son | null>; oublier: (id: string) => Promise<void>; liste: () => Promise<string[]> };
  ia: () => { adresse: string; code: string } | null;
  noter: (texte: string) => void;
  maintenant?: () => Date;
  appel?: Appel;                                     // tests
  delai?: (essais: number) => number;                // tests : millisecondes avant un nouvel essai
};

const ID = /^[A-Za-z0-9_-]{8,64}$/, JOUR = /^\d{4}-\d{2}-\d{2}$/;
/* demande reçue d'un appareil : seulement les champs connus, bien formés */
export function lireDemande(x: unknown): Demande | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max ? v : undefined;
  const type = o.type === "dictee" || o.type === "seance" || o.type === "analyse" ? o.type : null;
  const id = str(o.id, 64), date = str(o.date, 10);
  if (!type || !id || !ID.test(id) || !date || !JOUR.test(date)) return null;
  const d: Demande = { id, type, date };
  for (const [k, max] of [["appareil", 100], ["texte", 200_000], ["debut", 200_000], ["dossierId", 100], ["seanceId", 100], ["empreinte", 100]] as const) {
    const v = str(o[k], max); if (v !== undefined) d[k] = v;
  }
  if (o.sansPropre === true) d.sansPropre = true;
  if (type === "seance" && !d.dossierId) return null;
  if (type === "analyse" && !d.seanceId) return null;
  return d;
}

const nettoyer = <T>(v: T): T => JSON.parse(JSON.stringify(v));   // sans les champs undefined

export function creer(env: Env) {
  const maintenant = () => env.maintenant?.() ?? new Date();
  const nouvelId = () => crypto.randomUUID();
  const travaux = (l: Lecture): Travail[] => ((l.lire(CLE) as ValeurTravaux | null)?.travaux ?? []);
  const avec = (l: Lecture, t: Travail): Ecriture => ({ cle: CLE, valeur: nettoyer({ travaux: elaguer([...travaux(l).filter(x => x.id !== t.id), t], maintenant()) }) });
  const dossiers = (l: Lecture) => l.liste("dossiers/") as Dossier[];
  const seances = (l: Lecture) => l.liste("seances/") as Seance[];

  /* change un travail tel qu'il est au moment d'écrire ; disparu (abandonné sur un appareil) : rien */
  const maj = (id: string, f: (t: Travail) => Travail) => env.transaction(l => { const t = travaux(l).find(x => x.id === id); return t ? [avec(l, f(t))] : []; });

  let reveil: () => void = () => {};
  const reveiller = () => reveil();

  async function recevoir(d: Demande, son?: Son): Promise<Travail> {
    const deja = travaux(env).find(x => x.id === d.id);
    if (deja) return deja;
    if (d.type !== "analyse" && !d.texte && !son) throw new ErreurIA("Ni texte ni enregistrement.");
    if (son) await env.sons.garder(d.id, son);
    const t: Travail = { ...d, cree: maintenant().toISOString(), etat: "attente", essais: 0, ...(son && !d.texte ? { son: true } : {}) };
    await env.transaction(l => travaux(l).some(x => x.id === d.id) ? [] : [avec(l, t)]);
    reveiller();
    return travaux(env).find(x => x.id === d.id) ?? t;
  }

  /* ---------- un travail ---------- */

  async function executer(t0: Travail) {
    const ia = env.ia();
    const id = t0.id;
    try {
      if (!ia) throw new ErreurIA("Le PC ne connaît pas encore le code d'accès au serveur de l'appli.");
      const appel = env.appel ?? appelAbonnementVers(ia.adresse);
      let t = t0;
      if (t.type !== "analyse" && !t.texte) t = await transcrire(t);
      else await maj(id, x => ({ ...x, etat: "rangement", essais: x.essais + 1 }));
      if (t.type === "dictee") await rangerDictee(t, ia.code, appel);
      else await mettreAuPropre(t, ia.code, appel);
    } catch (e) {
      const message = e instanceof ErreurIA ? e.message : "Le travail n'a pas abouti sur le PC.";
      const nature = natureDe(e);
      const pasArrivee = e instanceof PasArrivee;
      if (!(e instanceof ErreurIA)) env.noter("Travail interrompu : " + String((e as Error)?.message || e));
      await maj(id, x => {
        const fin = nature === "definitif" || x.essais >= ESSAIS_MAX;
        if (fin) return { ...x, etat: "erreur", erreur: message, prochain: undefined };
        const ms = env.delai?.(x.essais) ?? (pasArrivee ? 20_000 : delaiEssai(x.essais) * 60_000);
        return { ...x, etat: "attente", erreur: message, prochain: new Date(maintenant().getTime() + ms).toISOString() };
      }).catch(() => {});
    }
  }

  /* la voix : transcrite par Whisper sur ce PC ; le texte est gardé dans le travail (une relance ne retranscrit pas) */
  async function transcrire(t: Travail): Promise<Travail> {
    await maj(t.id, x => ({ ...x, etat: "transcription", essais: x.essais + 1 }));
    const son = await env.sons.lire(t.id);
    if (!son) throw new ErreurIA("L'enregistrement n'est plus sur le PC.");
    const noms = t.type === "dictee"
      ? [...new Set(rdvsDuJour(dossiers(env), t.date).map(r => r.dossier.label))]
      : [(env.lire("dossiers/" + t.dossierId) as Dossier | null)?.label ?? ""].filter(Boolean);
    let brut: string;
    try { brut = nettoyerVoix(await env.transcrire(son, JSON.stringify(indiceVoix(noms) ?? {}))); }
    catch (e) { throw new ErreurIA((e as Error)?.message || "Whisper n'a pas répondu sur le PC.", (e as { nature?: "definitif" }).nature ?? "passager"); }
    if (!brut) throw new ErreurIA("Rien n'a été compris dans l'enregistrement.");
    const texte = t.debut?.trim() ? t.debut.trimEnd() + "\n" + brut : brut;
    let suite: Travail | null = null, introuvable = false;
    await env.transaction(l => {
      const x = travaux(l).find(y => y.id === t.id);
      if (!x) return [];
      const ecr: Ecriture[] = [];
      suite = { ...x, texte, etat: "rangement", son: false };
      /* la dictée est gardée telle que dictée, comme sur l'appareil (retrouver un patient oublié par l'IA) */
      if (t.type === "dictee") ecr.push(garderDictee(l, t.date, texte));
      /* séance d'une fiche : enregistrée tout de suite, telle que dite ; la mise au propre suit */
      if (t.type === "seance") {
        const d = l.lire("dossiers/" + t.dossierId) as Dossier | null;
        if (d) {
          const s: Seance = { id: nouvelId(), dossierId: d.id, date: t.date, contenu: texte, cree: maintenant().toISOString() };
          ecr.push({ cle: "seances/" + s.id, valeur: s });
          const rouvert = rouvrirApres(d, t.date);
          if (rouvert !== d) ecr.push({ cle: "dossiers/" + d.id, valeur: rouvert });
          suite = { ...suite, seanceId: s.id, empreinte: empreinteTexte(texte) };
        } else introuvable = true;
      }
      ecr.push(avec(l, suite));
      return ecr;
    });
    await env.sons.oublier(t.id).catch(() => {});
    if (!suite) throw new ErreurIA("Travail abandonné sur un appareil.");
    if (introuvable) throw new ErreurIA("Ce patient n'est plus dans Muninn : la séance n'a pas pu être rangée. Son texte est gardé.");
    return suite;
  }

  function garderDictee(l: Lecture, date: string, texte: string): Ecriture {
    const liste = ((l.lire("parametres/dictees") as { dictees?: DicteeGardee[] } | null)?.dictees ?? []);
    const t = texte.trim();
    if (liste.some(x => x.date === date && x.texte === t)) return { cle: "parametres/dictees", valeur: { dictees: liste } };
    const garde = [...liste, { id: nouvelId(), date, cree: maintenant().toISOString(), texte: t }].sort((a, b) => a.cree.localeCompare(b.cree)).slice(-30);
    return { cle: "parametres/dictees", valeur: { dictees: garde } };
  }

  async function rangerDictee(t: Travail, code: string, appel: Appel) {
    const patients = dossiers(env).filter(d => !estArchive(d)).map(d => ({ label: d.label, vuCeJour: d.rdvs.some(r => r && r.d === t.date) }));
    const { donnees: morceaux } = await decouperDictee(code, t.date, t.texte!, patients, appel);
    await env.transaction(l => {
      const x = travaux(l).find(y => y.id === t.id);
      if (!x || !enCours(x)) return [];
      const avant = dossiers(l);
      const r = rangerMorceaux(avant, seances(l), t.date, morceaux, { nouvelId, cree: maintenant().toISOString(), auj: isoDay(maintenant()), jour: jourLong });
      const parId = new Map(avant.map(d => [d.id, d] as const));
      const rdvs_avant: Record<string, Rdv[]> = {}, rdvs_apres: Record<string, Rdv[]> = {};
      for (const d of r.dossiers) { rdvs_avant[d.id] = parId.get(d.id)?.rdvs ?? []; rdvs_apres[d.id] = d.rdvs; }
      return [
        ...r.seances.map(s => ({ cle: "seances/" + s.id, valeur: s })),
        ...r.dossiers.map(d => ({ cle: "dossiers/" + d.id, valeur: d })),
        avec(l, { ...x, etat: "fini", fini: maintenant().toISOString(), erreur: undefined, prochain: undefined, ranges: r.ranges, doutes: r.doutes, rdvs: r.rdvs, rdvs_avant, rdvs_apres })
      ];
    });
  }

  /* séance déjà enregistrée (tapée, ou dite à la voix et transcrite ici) : mise au propre, « À venir », rendez-vous */
  async function mettreAuPropre(t: Travail, code: string, appel: Appel) {
    const s = env.lire("seances/" + t.seanceId) as Seance | null;
    const finir = (rdvs: string[] = []) => maj(t.id, x => ({ ...x, etat: "fini", fini: maintenant().toISOString(), erreur: undefined, prochain: undefined, rdvs }));
    if (!s) {
      // l'appareil l'envoie au PC juste avant : elle arrive d'une minute à l'autre ; au-delà de 15 minutes, elle a été supprimée
      if (maintenant().getTime() - new Date(t.cree).getTime() < ARRIVEE_MAX_MS) throw new PasArrivee();
      return finir();
    }
    if (t.empreinte && empreinteTexte(s.contenu) !== t.empreinte) return finir();   // modifiée depuis : un autre travail suit
    const { donnees: a } = await analyserSeance(code, s.date, s.contenu, !!t.sansPropre, appel);
    await env.transaction(l => {
      const x = travaux(l).find(y => y.id === t.id);
      const s2 = l.lire("seances/" + s.id) as Seance | null;
      if (!x || !enCours(x)) return [];
      const fini: Travail = { ...x, etat: "fini", fini: maintenant().toISOString(), erreur: undefined, prochain: undefined, rdvs: [] };
      if (!s2 || s2.contenu !== s.contenu) return [avec(l, fini)];   // supprimée ou modifiée pendant ce temps
      const se = { ...s2, ...patchAnalyse(s2, a, avenirFrom(s2.contenu)) };
      const ecr: Ecriture[] = [{ cle: "seances/" + se.id, valeur: se }];
      const d = l.lire("dossiers/" + se.dossierId) as Dossier | null;
      if (d) {
        const toutes = seances(l).map(y => y.id === se.id ? se : y);
        const r = analyseSurDossier(d, toutes, se, a, isoDay(maintenant()), jourLong);
        if (r.dossier !== d) ecr.push({ cle: "dossiers/" + d.id, valeur: r.dossier });
        if (r.message) fini.rdvs = [r.message];
      }
      ecr.push(avec(l, fini));
      return ecr;
    });
  }

  /* ---------- la file : un travail à la fois, dans l'ordre d'arrivée ---------- */

  let arret = false, boucleEnCours: Promise<void> | null = null;
  const prets = () => travaux(env).filter(t => enCours(t) && (!t.prochain || t.prochain <= maintenant().toISOString())).sort((a, b) => a.cree.localeCompare(b.cree));

  async function nettoyerSons() {
    const gardes = new Set(travaux(env).filter(t => enCours(t) && t.son).map(t => t.id));
    for (const id of await env.sons.liste().catch(() => [] as string[])) if (!gardes.has(id)) await env.sons.oublier(id).catch(() => {});
  }

  function demarrer() {
    boucleEnCours ??= (async () => {
      await nettoyerSons();
      while (!arret) {
        const t = prets()[0];
        if (t) { await executer(t); await nettoyerSons(); continue; }
        const prochains = travaux(env).filter(x => enCours(x) && x.prochain).map(x => new Date(x.prochain!).getTime());
        const attente = Math.max(1_000, Math.min(60_000, ...prochains.map(p => p - maintenant().getTime())));
        await new Promise<void>(r => { const m = setTimeout(r, attente); reveil = () => { clearTimeout(m); r(); }; });
        reveil = () => {};
      }
    })();
    return boucleEnCours;
  }

  function arreter() { arret = true; reveiller(); return boucleEnCours ?? Promise.resolve(); }

  /* pour l'écran « Partage avec le PC » : combien de travaux attendent */
  const etat = () => ({ version: VERSION, enCours: travaux(env).filter(enCours).length });

  return { recevoir, demarrer, arreter, reveiller, etat };
}

class PasArrivee extends ErreurIA { constructor() { super("La séance n'est pas encore arrivée sur le PC.", "passager"); } }
