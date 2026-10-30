/* Partage avec le PC : chaque appareil (tablette, téléphone, PC) garde tout et fonctionne seul ;
   dès qu'il joint le PC (par Tailscale), il reçoit les nouveautés des autres appareils puis envoie les siennes.
   Le PC fait le lien : il garde la base complète, et chaque modification y prend un numéro (rev).
   Échange : à l'ouverture, quelques secondes après chaque changement, puis toutes les minutes tant que l'appli est à l'écran.
   Les modifications faites des deux côtés sont réunies (voir fusion.ts). */
import * as db from "./db";
import { egal, fusion3 } from "./fusion";
import type { Bilan } from "./regles";

export const PARAM_ADRESSE = "sync_adresse", PARAM_CODE = "sync_code";
const PARAM_REV = "sync_rev", PARAM_OK = "sync_ok";
const PAQUET = 200;

export type EtatSync = { relie: boolean; enCours: boolean; derniere: string | null; erreur: string | null };
let etat: EtatSync = { relie: false, enCours: false, derniere: null, erreur: null };
const abonnes = new Set<() => void>();
export function abonner(fn: () => void) { abonnes.add(fn); return () => abonnes.delete(fn); }
export const etatSync = () => etat;
const maj = (p: Partial<EtatSync>) => { etat = { ...etat, ...p }; abonnes.forEach(fn => fn()); };

export class ErreurSync extends Error {}

type Config = { adresse: string; code: string };
type Changement = { cle: string; rev: number; valeur?: unknown; supprime?: boolean };

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
  if (r.status === 429) throw new ErreurSync("Trop d'essais avec un mauvais code : patientez 10 minutes.");
  if (!r.ok) throw new ErreurSync(`Le PC a répondu par une erreur (${r.status}).`);
  return r;
}

async function json<T>(cfg: Config, chemin: string, corps?: unknown): Promise<T> {
  const r = await appel(cfg, chemin, corps === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }, 120_000);
  try { return await r!.json() as T; } catch { throw new ErreurSync("Réponse du PC illisible. Muninn est-il bien installé sur le PC ?"); }
}

/* ---------- relier, délier ---------- */

/* Vérifie que le PC répond avec ce code, puis le retient. Relié à un autre PC qu'avant : l'appareil repart de zéro (tout envoyer, tout recevoir). */
export async function relier(adresseTapee: string, code: string): Promise<void> {
  const cfg = { adresse: normaliserAdresse(adresseTapee), code: code.trim() };
  const r = await json<{ muninn?: boolean }>(cfg, "/api/sync/etat");
  if (!r.muninn) throw new ErreurSync("Cette adresse ne répond pas comme Muninn.");
  if ((await db.lireParametre<string>(PARAM_ADRESSE)) !== cfg.adresse) {
    await db.oublierPartage();
    await db.ecrireParametre(PARAM_REV, 0);
  }
  await db.ecrireParametre(PARAM_ADRESSE, cfg.adresse);
  await db.ecrireParametre(PARAM_CODE, cfg.code);
  maj({ relie: true, erreur: null });
  await synchroniser();
}

/* L'appareil garde ses données mais n'échange plus rien avec le PC. */
export async function delier() {
  await db.ecrireParametre(PARAM_ADRESSE, undefined);
  await db.ecrireParametre(PARAM_CODE, undefined);
  await db.ecrireParametre(PARAM_REV, undefined);
  await db.oublierPartage();
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
    for (let essai = 0; essai < 3; essai++) {
      await recevoir(cfg);
      if (!(await envoyer(cfg))) break;   // un autre appareil a écrit entre-temps : on reçoit et on recommence
    }
    await recevoirFichiers(cfg);
    const quand = new Date().toISOString();
    await db.ecrireParametre(PARAM_OK, quand);
    maj({ enCours: false, derniere: quand, erreur: null });
  } catch (e) {
    console.error("Partage avec le PC :", e);
    maj({ enCours: false, erreur: e instanceof ErreurSync ? e.message : "L'échange avec le PC n'a pas abouti." });
  }
}

/* les nouveautés du PC depuis le dernier échange, réunies avec ce qui a changé ici */
async function recevoir(cfg: Config) {
  let rev = (await db.lireParametre<number>(PARAM_REV)) ?? 0;
  for (;;) {
    const r = await json<{ rev: number; changements: Changement[]; suite?: boolean }>(cfg, `/api/sync/changements?depuis=${rev}`);
    if (r.changements.length) {
      const [local, bases] = await Promise.all([db.etatPartage(), db.basesPartage()]);
      const ecritures: { cle: string; valeur: unknown }[] = [], nouvelles: db.Base[] = [];
      for (const c of r.changements) {
        const distant = c.supprime ? null : c.valeur ?? null, ici = local.get(c.cle) ?? null;
        const v = fusion3(bases.get(c.cle)?.valeur ?? null, ici, distant) ?? null;
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
  const ids = changements.flatMap(c => c.cle.startsWith("bilans/") && c.valeur ? (c.valeur as Bilan).fichiers.map(f => f.id) : []);
  if (ids.length) {
    const { absents } = await json<{ absents: string[] }>(cfg, "/api/sync/fichiers/absents", { ids });
    for (const id of absents) {
      const blob = await db.fichierBlob(id);
      if (blob) await appel(cfg, "/api/sync/fichiers/" + encodeURIComponent(id), { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob }, 300_000);
    }
  }

  let conflit = false;
  for (let i = 0; i < changements.length; i += PAQUET) {
    const paquet = changements.slice(i, i + PAQUET), parCle = new Map(paquet.map(c => [c.cle, c]));
    const r = await json<{ acceptes: { cle: string; rev: number }[]; conflits: string[] }>(cfg, "/api/sync/envoi", { changements: paquet });
    await db.appliquerPartage([], r.acceptes.map(a => ({ cle: a.cle, valeur: parCle.get(a.cle)?.supprime ? null : parCle.get(a.cle)?.valeur ?? null, rev: a.rev })));
    if (r.conflits.length) conflit = true;
  }
  return conflit;
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
