/* Le PC fait le travail en tâche de fond (1.9.0, choix de Corentin du 14 novembre 2026) : côté appareil.
   Quand le PC est relié, joignable et prêt (travail.mjs installé), l'appareil lui confie ses dictées groupées, ses séances
   dites à la voix et la mise au propre des séances enregistrées, puis Corentin peut fermer Muninn : le PC transcrit,
   demande le travail à l'IA, range le résultat dans la base commune et réessaie seul. Le résultat arrive au partage suivant.
   PC injoignable, pas prêt, ou IA réglée sur la clé API : tout se fait sur l'appareil, comme avant.

   Les travaux et leur état sont un réglage partagé (parametres/travaux, voir src/pc/travail.ts). L'appareil n'y écrit que ce
   qui lui revient : un travail fait chez lui (PC injoignable) pour son récapitulatif, le récapitulatif refermé (« vu »),
   un passage rangé à la main, « Réessayer » et l'abandon d'un travail en erreur. Jamais l'avancement, qui est au PC. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import { elaguer, type Demande, type Travail } from "./pc/travail";
import { etatSync, PARAM_ADRESSE, PARAM_CODE, synchroniser } from "./synchro";
import { toast } from "./ui";

export type { Travail };
const CLE = "travaux";
const CACHE_PRET = "pc-travail";   // le PC prend-il le travail ? (dernier état connu, pour le démarrage de l'appli)

let enBase: Travail[] = [];
let envoyes: Travail[] = [];      // confiés au PC, pas encore revenus par le partage
const abonnes = new Set<() => void>();
export function abonner(fn: () => void) { abonnes.add(fn); return () => abonnes.delete(fn); }
const prevenir = () => abonnes.forEach(fn => fn());

/* tous les travaux connus ici, les plus anciens d'abord */
export function liste(): Travail[] {
  const ids = new Set(enBase.map(t => t.id));
  return [...enBase, ...envoyes.filter(t => !ids.has(t.id))].sort((a, b) => a.cree.localeCompare(b.cree));
}
export const enCours = (t: Travail) => t.etat === "attente" || t.etat === "transcription" || t.etat === "rangement";
/* une séance que le PC est en train de mettre au propre */
export const surSeance = (id: string) => liste().some(t => t.seanceId === id && enCours(t));
/* séance d'une fiche dite à la voix, pas encore rangée par le PC (ou en erreur) */
export const seancesVoix = (dossierId: string) => liste().filter(t => t.type === "seance" && t.dossierId === dossierId && !t.seanceId && t.etat !== "fini");

async function relire() {
  const avant = JSON.stringify(enBase);
  enBase = (await db.lireParametre<{ travaux?: Travail[] }>(CLE).catch(() => undefined))?.travaux ?? [];
  const ids = new Set(enBase.map(t => t.id));
  envoyes = envoyes.filter(t => !ids.has(t.id));
  if (JSON.stringify(enBase) !== avant || premiere) { await annoncer(); prevenir(); }
}

/* ---------- le PC prend-il le travail ? ---------- */

const lireCache = () => { try { return localStorage.getItem(CACHE_PRET) === "1"; } catch { return false; } };
const ecrireCache = (v: boolean) => { try { localStorage.setItem(CACHE_PRET, v ? "1" : "0"); } catch { /* sans stockage */ } };

export type Acces = { adresse: string; code: string; codeIA: string };
/* le PC est relié et prêt, et l'IA passe par l'abonnement (le PC demande au serveur de l'appli avec le même code) */
export async function accepte(): Promise<Acces | null> {
  const [adresse, code, codeIA, apiAutorisee, mode] = await Promise.all([
    db.lireParametre<string>(PARAM_ADRESSE), db.lireParametre<string>(PARAM_CODE), db.lireParametre<string>("code_acces"),
    db.lireParametre<boolean>("api_autorisee"), db.lireParametre<string>("mode_ia")
  ]).catch(() => [] as unknown[]) as [string?, string?, string?, boolean?, string?];
  if (!adresse || !code || !codeIA) return null;
  if (apiAutorisee === true && mode === "api") return null;
  const pc = etatSync().pc;
  const pret = pc ? pc.travail?.pret === true : lireCache();
  if (pc) ecrireCache(pc.travail?.pret === true);
  return pret ? { adresse, code, codeIA } : null;
}

/* ---------- confier un travail au PC ---------- */

/* Rend le travail tel que le PC l'a noté. Erreur (ErreurIA) : PC injoignable ou travail refusé, rien n'est parti.
   Une séance à mettre au propre part d'abord au PC par le partage. */
export async function confier(a: Acces, d: Omit<Demande, "id" | "appareil">, son?: Blob): Promise<Travail> {
  if (d.type === "analyse") await synchroniser();
  const demande: Demande = { ...d, id: crypto.randomUUID(), appareil: await db.appareil() };
  let r: Response;
  try {
    r = await fetch(a.adresse + "/api/travail" + (son ? "?demande=" + encodeURIComponent(JSON.stringify(demande)) : ""), {
      method: "POST",
      headers: { Authorization: "Bearer " + a.code, "X-Muninn-IA": a.codeIA, "Content-Type": son ? son.type || "audio/webm" : "application/json" },
      body: son ?? JSON.stringify({ demande }),
      signal: AbortSignal.timeout(son ? 10 * 60_000 : 60_000)
    });
  } catch {
    throw new ErreurIA("Le PC est injoignable (éteint, ou Tailscale coupé ?).", navigator.onLine === false ? "reseau" : "passager");
  }
  let corps: { travail?: Travail; erreur?: string } = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok || !corps.travail) {
    if (r.status === 503) ecrireCache(false);
    throw new ErreurIA(corps.erreur || `Le PC a répondu par une erreur (${r.status}).`, r.status === 401 ? "definitif" : "passager");
  }
  envoyes.push(corps.travail);
  prevenir();
  synchroniser();
  return corps.travail;
}

/* ---------- ce que l'appareil écrit dans les travaux ---------- */

async function ecrire(f: (l: Travail[]) => Travail[]) {
  // travaux finis gardés 14 jours (40 au plus), comme sur le PC
  await db.modifierParametrePartage<{ travaux?: Travail[] }>(CLE, v => ({ travaux: elaguer(f(v?.travaux ?? []), new Date()) }));
  await relire();
}
/* un travail fait sur cet appareil (PC injoignable) : gardé pour son récapitulatif, visible des autres appareils */
export const ajouterLocal = (t: Travail) => ecrire(l => [...l.filter(x => x.id !== t.id), t]);
export const modifier = (id: string, f: (t: Travail) => Travail) => ecrire(l => l.map(t => t.id === id ? f(t) : t));
export const retirer = (id: string) => { envoyes = envoyes.filter(t => t.id !== id); return ecrire(l => l.filter(t => t.id !== id)); };
/* « Réessayer » un travail que le PC a arrêté */
export const relancer = (id: string) => modifier(id, t => {
  const { erreur: _e, prochain: _p, ...reste } = t;
  return { ...reste, etat: "attente", essais: 0 };
});

/* ---------- l'appareil qui a confié un travail en annonce le résultat ---------- */

const ANNONCES = "travaux-annonces";
let premiere = true;   // à l'ouverture : les travaux déjà finis ne sont pas annoncés de nouveau
async function annoncer() {
  const moi = await db.appareil().catch(() => "");
  let deja: string[] = [];
  try { deja = JSON.parse(localStorage.getItem(ANNONCES) || "[]"); } catch { /* rien */ }
  const nouveaux = enBase.filter(t => t.appareil === moi && !t.local && (t.etat === "fini" || t.etat === "erreur") && !deja.includes(t.id));
  const silence = premiere; premiere = false;
  if (!nouveaux.length) return;
  try { localStorage.setItem(ANNONCES, JSON.stringify([...deja, ...nouveaux.map(t => t.id)].slice(-60))); } catch { /* rien */ }
  if (silence) return;
  for (const t of nouveaux) {
    if (t.etat === "erreur") toast((t.type === "dictee" ? "Le PC n'a pas pu ranger votre dictée : " : "Le PC n'a pas pu traiter votre séance : ") + (t.erreur ?? "erreur inconnue."));
    else if (t.type === "dictee") toast(`Dictée rangée par le PC : ${t.ranges?.length ?? 0} séance${(t.ranges?.length ?? 0) > 1 ? "s" : ""}${t.doutes?.length ? `, ${t.doutes.length} à ranger à la main` : ""}.`);
    else if (t.rdvs?.length) toast(t.rdvs.join(" "));
  }
}

/* ---------- démarrage : la liste suit la base ; le partage s'accélère tant qu'un travail confié est en cours ---------- */

let branche = false;
export async function brancher() {
  if (branche) return;
  branche = true;
  db.abonner(() => { relire(); });
  await relire();
  setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (liste().some(enCours)) synchroniser();
  }, 8_000);
}
