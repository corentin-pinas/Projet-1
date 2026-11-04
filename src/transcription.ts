/* Dictée enregistrée puis transcrite par Whisper.
   Appareil relié au PC : la voix part au PC (par Tailscale), où Whisper la transcrit ; elle ne sort pas de chez Corentin.
   Sinon, secours : le serveur de l'appli, s'il a un Whisper branché (variable WHISPER_URL sur Railway).
   Le texte revient dans la dictée. Sans Whisper joignable, le bouton n'apparaît pas. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import { PARAM_ADRESSE, PARAM_CODE } from "./synchro";

const code = () => db.lireParametre<string>("code_acces");

async function pc(): Promise<{ adresse: string; code: string } | null> {
  const [adresse, c] = await Promise.all([db.lireParametre<string>(PARAM_ADRESSE), db.lireParametre<string>(PARAM_CODE)]).catch(() => [undefined, undefined]);
  return adresse && c ? { adresse, code: c } : null;
}

/* Whisper est-il prêt sur le PC ? null : PC pas relié ou injoignable */
export async function etatPC(): Promise<{ pret: boolean; installee: boolean } | null> {
  const p = await pc();
  if (!p) return null;
  try {
    const r = await fetch(p.adresse + "/api/voix/etat", { headers: { Authorization: "Bearer " + p.code }, signal: AbortSignal.timeout(8_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/* sait-on transcrire ? (Whisper prêt sur le PC, ou sur le serveur de l'appli) */
export async function disponible(): Promise<boolean> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
  if ((await etatPC())?.pret) return true;
  const c = await code().catch(() => undefined);
  if (!c || !navigator.onLine) return false;
  try {
    const r = await fetch("/api/ia/etat", { headers: { Authorization: "Bearer " + c } });
    return r.ok && (await r.json()).transcription === true;
  } catch { return false; }
}

/* Écran tenu allumé pendant un enregistrement, une transcription ou le rangement d'une dictée : la mise en veille
   coupe le micro, et sur un PC portable elle peut suspendre Chrome en plein travail (constaté le 3 novembre 2026,
   dictée de 11 minutes). eveil() renvoie la fonction qui relâche la demande ; l'écran peut s'éteindre quand plus
   personne n'en a besoin. Sans Wake Lock (vieux navigateur), rien ne change. */
let verrou: { release: () => Promise<void> } | null = null, demandes = 0;
async function tenirEveille() {
  if (!demandes || verrou || typeof document === "undefined" || document.visibilityState !== "visible") return;
  try {
    const v = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (e: "release", f: () => void) => void }> } }).wakeLock?.request("screen");
    if (!v) return;
    if (!demandes) { v.release().catch(() => {}); return; }
    verrou = v; v.addEventListener("release", () => { if (verrou === v) verrou = null; });
  } catch { /* refusé (économie d'énergie…) : on continue sans */ }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { tenirEveille(); });   // redemandé au retour sur l'appli
export function eveil(): () => void {
  demandes++; tenirEveille();
  let rendu = false;
  return () => {
    if (rendu) return; rendu = true;
    if (--demandes === 0 && verrou) { const v = verrou; verrou = null; v.release().catch(() => {}); }
  };
}

export type Enregistrement = { arreter: () => Promise<Blob>; annuler: () => void; debut: number; coupe: () => boolean };

/* texte du chrono : la durée, ou l'avis que la tablette a coupé le micro (ce qui a été dit avant reste gardé) */
export function chrono(e: Enregistrement, duree: (ms: number) => string) {
  return e.coupe() ? "coupé par la tablette (écran éteint ?). Touchez « Arrêter et transcrire » : le début est gardé." : duree(Date.now() - e.debut);
}

/* démarre le micro ; arreter() rend l'enregistrement, qui reste dans la tablette tant qu'il n'est pas transcrit */
export async function enregistrer(): Promise<Enregistrement> {
  let flux: MediaStream;
  try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { throw new ErreurIA("Le micro est refusé. Autorisez-le pour l'appli dans les réglages de Chrome."); }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
  const morceaux: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) morceaux.push(e.data); };
  /* la tablette peut couper le micro d'elle-même (écran éteint, appli quittée, autre appli qui prend le micro) :
     l'enregistrement s'arrête alors seul. Ce qui a été enregistré jusque-là est gardé et « Arrêter » le rend aussitôt,
     au lieu d'attendre un arrêt qui a déjà eu lieu. */
  let fini: (() => void) | null = null, arrete = false;
  rec.onstop = () => { arrete = true; fini?.(); };
  rec.start(1000);
  const relacher = eveil();
  const couper = () => { relacher(); flux.getTracks().forEach(t => t.stop()); };
  const son = () => new Blob(morceaux, { type: rec.mimeType || "audio/webm" });
  return {
    debut: Date.now(),
    coupe: () => arrete || rec.state === "inactive",
    arreter: () => new Promise(ok => {
      const rendre = () => { couper(); ok(son()); };
      if (arrete || rec.state === "inactive") { setTimeout(rendre, 50); return; }   // dernier morceau éventuel
      fini = rendre;
      try { rec.stop(); } catch { rendre(); }
    }),
    annuler: () => { fini = null; couper(); try { if (rec.state !== "inactive") rec.stop(); } catch { /* déjà arrêté */ } }
  };
}

export async function transcrire(audio: Blob): Promise<string> {
  const relacher = eveil();
  try { return await transcrireSansVeille(audio); } finally { relacher(); }
}

async function transcrireSansVeille(audio: Blob): Promise<string> {
  const p = await pc();
  if (p && (await etatPC())?.pret) {
    let r: Response;
    try {
      r = await fetch(p.adresse + "/api/voix/transcrire", { method: "POST", headers: { Authorization: "Bearer " + p.code, "Content-Type": audio.type || "audio/webm" }, body: audio });
    } catch { throw new ErreurIA("Le PC est injoignable. L'enregistrement est gardé : réessayez."); }
    let corps: { texte?: string; erreur?: string } = {};
    try { corps = await r.json(); } catch { /* réponse vide */ }
    if (!r.ok || !corps.texte) throw new ErreurIA(corps.erreur || `Le PC a répondu par une erreur (${r.status}).`);
    return corps.texte;
  }
  const c = await code();
  if (!c) throw new ErreurIA("Le code d'accès au serveur n'est pas réglé.");
  let r: Response;
  try {
    r = await fetch("/api/ia/transcrire", { method: "POST", headers: { Authorization: "Bearer " + c, "Content-Type": audio.type || "audio/webm" }, body: audio });
  } catch { throw new ErreurIA("Le serveur de l'appli est injoignable. L'enregistrement est gardé : réessayez."); }
  let corps: { texte?: string; erreur?: string } = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok || !corps.texte) throw new ErreurIA(corps.erreur || `Le serveur a répondu par une erreur (${r.status}).`);
  return corps.texte;
}
