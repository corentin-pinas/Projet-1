/* Partage avec le PC : chaque appareil (tablette, téléphone, PC) garde tout et fonctionne seul ;
   dès qu'il joint le PC (par Tailscale), il reçoit les nouveautés des autres appareils puis envoie les siennes.
   Le PC fait le lien : il garde la base complète, et chaque modification y prend un numéro (rev).
   Échange : à l'ouverture, quelques secondes après chaque changement, puis toutes les minutes tant que l'appli est à l'écran.
   Les modifications faites des deux côtés sont réunies (voir fusion.ts). */
import * as db from "./db";
import { egal, fusion3 } from "./fusion";
import type { Bilan } from "./regles";

export const PARAM_ADRESSE = "sync_adresse", PARAM_CODE = "sync_code";
const PARAM_REV = "sync_rev", PARAM_OK = "sync_ok", PARAM_QUITTE = "sync_adresse_quittee", PARAM_ID = "sync_base_pc";
const PAQUET = 200;

export type EtatSync = { relie: boolean; enCours: boolean; derniere: string | null; erreur: string | null; pcRevenu?: boolean };
let etat: EtatSync = { relie: false, enCours: false, derniere: null, erreur: null };
const abonnes = new Set<() => void>();
export function abonner(fn: () => void) { abonnes.add(fn); return () => abonnes.delete(fn); }
export const etatSync = () => etat;
const maj = (p: Partial<EtatSync>) => { etat = { ...etat, ...p }; abonnes.forEach(fn => fn()); };

export class ErreurSync extends Error {}
/* la base du PC est repartie d'un état plus ancien : les échanges s'arrêtent tant qu'un appareil ne l'a pas remise à niveau */
export class ErreurPCRevenu extends ErreurSync {
  constructor() { super("Le PC est revenu en arrière (il est reparti d'une copie plus ancienne). Les échanges sont arrêtés pour ne rien perdre : remettez le PC à niveau depuis l'appareil le plus à jour."); }
}

type Config = { adresse: string; code: string };
type Changement = { cle: string; rev: number; valeur?: unknown; supprime?: boolean };
type Identite = { id?: string; origine?: string };

async function config(): Promise<Config | null> {
  const [adresse, code] = await Promise.all([db.lireParametre<string>(PARAM_ADRESSE), db.lireParametre<string>(PARAM_CODE)]);
  return adresse && code ? { adresse, code } : null;
}

/* « muninn-pc.tail1234.ts.net » ou une adresse complète : toujours https, sans / à la fin (http seulement pour l'appareil lui-même, dans les tests) */
export function normaliserAdresse(t: string): string {
  let a = t.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(a)) a = "https://" + a;
  return a;
}

async function appel(cfg: Config, chemin: string, init: RequestInit = {}, delai = 30_000): Promise<Response | null> {
  let r: Response;
  try {
    r = await fetch(cfg.adresse + chemin, { ...init, headers: { Authorization: "Bearer " + cfg.code, ...init.headers }, signal: AbortSignal.timeout(delai) });
  } catch {
    throw new ErreurSync(navigator.onLine ? "PC injoignable : est-il allumé, avec Tailscale actif sur les deux appareils ?" : "Pas de connexion internet.");
  }
  if (r.status === 404 && chemin.startsWith("/api/sync/fichiers/")) return null;
  if (r.status === 401) throw new ErreurSync("Le PC refuse le code : vérifiez-le.");
  if (r.status === 409) throw new ErreurPCRevenu();
  if (r.status === 429) throw new ErreurSync("Trop d'essais avec un mauvais code : patientez 10 minutes.");
  if (!r.ok) throw new ErreurSync(`Le PC a répondu par une erreur (${r.status}).`);
  return r;
}

async function json<T>(cfg: Config, chemin: string, corps?: unknown): Promise<T> {
  const r = await appel(cfg, chemin, corps === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }, 120_000);
  try { return await r!.json() as T; } catch { throw new ErreurSync("Réponse du PC illisible. Muninn est-il bien installé sur le PC ?"); }
}

/* ---------- relier, délier ---------- */

/* Vérifie que le PC répond avec ce code, puis le retient. Relié à un autre PC qu'avant (ou adresse tapée autrement) :
   l'appareil oublie son historique d'échange ; à l'échange suivant, le PC fait foi pour tout ce qu'il connaît (voir recevoir)
   et l'appareil n'envoie que ce que le PC n'a jamais vu. Relié de nouveau au PC qu'il avait quitté : il reprend où il en était. */
export async function relier(adresseTapee: string, code: string): Promise<void> {
  const cfg = { adresse: normaliserAdresse(adresseTapee), code: code.trim() };
  const r = await json<{ muninn?: boolean }>(cfg, "/api/sync/etat");
  if (!r.muninn) throw new ErreurSync("Cette adresse ne répond pas comme Muninn.");
  const avant = (await db.lireParametre<string>(PARAM_ADRESSE)) ?? (await db.lireParametre<string>(PARAM_QUITTE));
  if (avant !== cfg.adresse) {
    await db.oublierPartage();
    await db.ecrireParametre(PARAM_REV, 0);
    await db.ecrireParametre(PARAM_ID, undefined);
  }
  await db.ecrireParametre(PARAM_ADRESSE, cfg.adresse);
  await db.ecrireParametre(PARAM_CODE, cfg.code);
  await db.ecrireParametre(PARAM_QUITTE, undefined);
  maj({ relie: true, erreur: null });
  await synchroniser();
}

/* L'appareil garde ses données mais n'échange plus rien avec le PC. Il garde aussi l'historique de ses échanges :
   relié plus tard au même PC, il reprend où il en était, sans que ses vieilles versions écrasent les nouvelles (audit C1). */
export async function delier() {
  const adresse = await db.lireParametre<string>(PARAM_ADRESSE);
  if (adresse) await db.ecrireParametre(PARAM_QUITTE, adresse);
  await db.ecrireParametre(PARAM_ADRESSE, undefined);
  await db.ecrireParametre(PARAM_CODE, undefined);
  maj({ relie: false, enCours: false, erreur: null, derniere: null });
}

/* ---------- l'échange ---------- */

let course: Promise<void> | null = null, encore = false;
let applique = false;   // pendant qu'on range ce qui arrive du PC : ce n'est pas un changement à renvoyer tout de suite

/* un seul échange à la fois ; une demande pendant un échange en relance un juste après */
export function synchroniser(): Promise<void> {
  if (course) { encore = true; return course; }
  course = (async () => {
    try { do { encore = false; await unEchange(); } while (encore); }
    finally { course = null; }
  })();
  return course;
}

async function unEchange() {
  const cfg = await config();
  if (!cfg) { if (etat.relie) maj({ relie: false }); return; }
  maj({ relie: true, enCours: true });
  try {
    let refus = false;
    for (let essai = 0; essai < 3; essai++) {
      await recevoir(cfg);
      refus = await envoyer(cfg);
      if (!refus) break;   // un autre appareil a écrit entre-temps : on reçoit et on recommence
    }
    // jamais « À jour » si des changements de cet appareil n'ont pas pu partir
    if (refus) throw new ErreurSync("Des changements de cet appareil n'ont pas pu être envoyés au PC ; nouvel essai à l'échange suivant.");
    await recevoirFichiers(cfg);
    const quand = new Date().toISOString();
    await db.ecrireParametre(PARAM_OK, quand);
    maj({ enCours: false, derniere: quand, erreur: null, pcRevenu: false });
  } catch (e) {
    console.error("Partage avec le PC :", e);
    maj({ enCours: false, erreur: e instanceof ErreurSync ? e.message : "L'échange avec le PC n'a pas abouti.", pcRevenu: e instanceof ErreurPCRevenu });
  }
}

/* les nouveautés du PC depuis le dernier échange, réunies avec ce qui a changé ici */
async function recevoir(cfg: Config) {
  let rev = (await db.lireParametre<number>(PARAM_REV)) ?? 0;
  for (;;) {
    const r = await json<{ rev: number; changements: Changement[]; suite?: boolean } & Identite>(cfg, `/api/sync/changements?depuis=${rev}`);
    if (r.id) {
      const connu = await db.lireParametre<string>(PARAM_ID);
      if (!connu) await db.ecrireParametre(PARAM_ID, r.id);
      else if (connu !== r.id) {
        // un autre appareil a remis le PC à niveau : on reprend tout depuis le début ; l'historique gardé ici
        // permet de ne garder de cet appareil que ce qui n'était pas encore parti
        if (r.origine === "remise" && rev !== 0) { await db.ecrireParametre(PARAM_ID, r.id); rev = 0; await db.ecrireParametre(PARAM_REV, 0); continue; }
        if (r.origine === "remise") await db.ecrireParametre(PARAM_ID, r.id);
        else throw new ErreurPCRevenu();
      }
    }
    if (r.changements.length) {
      const [local, bases] = await Promise.all([db.etatPartage(), db.basesPartage()]);
      const ecritures: { cle: string; valeur: unknown }[] = [], nouvelles: db.Base[] = [];
      for (const c of r.changements) {
        const distant = c.supprime ? null : c.valeur ?? null, ici = local.get(c.cle) ?? null;
        // sans version commune (appareil neuf, fichier de copie restauré, autre PC) : le PC fait foi pour ce qu'il connaît,
        // sinon de vieilles versions gardées ici écraseraient partout les nouvelles (audit C1)
        const b = bases.get(c.cle);
        const v = b ? fusion3(b.valeur ?? null, ici, distant) ?? null : distant;
        if (!egal(v, ici)) ecritures.push({ cle: c.cle, valeur: v });
        nouvelles.push({ cle: c.cle, valeur: distant, rev: c.rev });
      }
      applique = true;
      try { await db.appliquerPartage(ecritures, nouvelles); } finally { applique = false; }
    }
    rev = r.rev;
    await db.ecrireParametre(PARAM_REV, rev);
    if (!r.suite) return;
  }
}

/* ce qui a changé ici depuis le dernier échange ; renvoie vrai si le PC a refusé un élément (modifié entre-temps ailleurs) */
async function envoyer(cfg: Config): Promise<boolean> {
  const [local, bases] = await Promise.all([db.etatPartage(), db.basesPartage()]);
  const changements: Changement[] = [];
  for (const cle of new Set([...local.keys(), ...bases.keys()])) {
    const ici = local.get(cle) ?? null, b = bases.get(cle);
    if (egal(ici, b?.valeur ?? null)) continue;
    changements.push(ici === null ? { cle, rev: b?.rev ?? 0, supprime: true } : { cle, rev: b?.rev ?? 0, valeur: ici });
  }
  if (!changements.length) return false;

  /* les PDF et photos d'abord : un bilan n'arrive jamais sur le PC sans ses fichiers */
  await envoyerFichiers(cfg, changements.flatMap(c => c.cle.startsWith("bilans/") && c.valeur ? [c.valeur as Bilan] : []));

  const id = await db.lireParametre<string>(PARAM_ID);
  let conflit = false;
  for (let i = 0; i < changements.length; i += PAQUET) {
    const paquet = changements.slice(i, i + PAQUET), parCle = new Map(paquet.map(c => [c.cle, c]));
    const r = await json<{ acceptes: { cle: string; rev: number }[]; conflits: string[] }>(cfg, "/api/sync/envoi", { changements: paquet, ...(id ? { id } : {}) });
    await db.appliquerPartage([], r.acceptes.map(a => ({ cle: a.cle, valeur: parCle.get(a.cle)?.supprime ? null : parCle.get(a.cle)?.valeur ?? null, rev: a.rev })));
    if (r.conflits.length) conflit = true;
  }
  return conflit;
}

async function envoyerFichiers(cfg: Config, bilans: Bilan[]) {
  const ids = bilans.flatMap(b => b.fichiers.map(f => f.id));
  if (!ids.length) return;
  const { absents } = await json<{ absents: string[] }>(cfg, "/api/sync/fichiers/absents", { ids });
  for (const id of absents) {
    const blob = await db.fichierBlob(id);
    if (blob) await appel(cfg, "/api/sync/fichiers/" + encodeURIComponent(id), { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }, 300_000);
  }
}

/* Après un retour en arrière du PC : cet appareil (le plus à jour) lui renvoie tout ce qu'il a. Les éléments que
   l'appareil ne connaît pas restent sur le PC ; les autres appareils reprennent ensuite tout seuls (origine « remise »). */
export async function remettreLePCaNiveau(): Promise<void> {
  const cfg = await config();
  if (!cfg) throw new ErreurSync("Cet appareil n'est pas relié au PC.");
  maj({ enCours: true });
  try {
    const pc = await json<Identite>(cfg, "/api/sync/etat");
    const [local, bases, { bilans }] = await Promise.all([db.etatPartage(), db.basesPartage(), db.tout()]);
    const elements: { cle: string; valeur: unknown }[] = [...local].map(([cle, valeur]) => ({ cle, valeur }));
    for (const [cle, b] of bases) if (!local.has(cle) && b.valeur !== null) elements.push({ cle, valeur: null });   // supprimés ici
    await envoyerFichiers(cfg, bilans);
    const r = await json<{ id: string; revs: { cle: string; rev: number }[] }>(cfg, "/api/sync/remplacer", { id: pc.id, elements });
    const parCle = new Map(elements.map(e => [e.cle, e.valeur]));
    await db.oublierPartage();
    await db.appliquerPartage([], r.revs.map(x => ({ cle: x.cle, valeur: parCle.get(x.cle) ?? null, rev: x.rev })));
    await db.ecrireParametre(PARAM_ID, r.id);
    await db.ecrireParametre(PARAM_REV, 0);   // reçoit aussi ce que le PC avait et que cet appareil ne connaît pas
    maj({ enCours: false, erreur: null, pcRevenu: false });
  } catch (e) {
    maj({ enCours: false });
    throw e;
  }
  await synchroniser();
}

/* les PDF et photos des bilans arrivés d'un autre appareil */
async function recevoirFichiers(cfg: Config) {
  const { bilans } = await db.tout();
  for (const id of await db.fichiersAbsents(bilans.flatMap(b => b.fichiers.map(f => f.id)))) {
    const r = await appel(cfg, "/api/sync/fichiers/" + encodeURIComponent(id), {}, 300_000);
    if (r) await db.ajouterFichier(id, await r.blob());
  }
}

/* ---------- quand échanger ---------- */

let minuterie: ReturnType<typeof setTimeout> | undefined;
const bientot = (ms: number) => { clearTimeout(minuterie); minuterie = setTimeout(() => synchroniser(), ms); };

export async function brancher() {
  const [cfg, derniere] = await Promise.all([config(), db.lireParametre<string>(PARAM_OK)]);
  maj({ relie: !!cfg, derniere: derniere ?? null });
  db.abonner(() => { if (!applique) bientot(2_000); });
  setInterval(() => { if (!document.hidden) synchroniser(); }, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) synchroniser(); });
  addEventListener("online", () => synchroniser());
  synchroniser();
}
