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

export type Enregistrement = { arreter: () => Promise<Blob>; annuler: () => void; debut: number };

/* démarre le micro ; arreter() rend l'enregistrement, qui reste dans la tablette tant qu'il n'est pas transcrit */
export async function enregistrer(): Promise<Enregistrement> {
  let flux: MediaStream;
  try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { throw new ErreurIA("Le micro est refusé. Autorisez-le pour l'appli dans les réglages de Chrome."); }
  const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find(t => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(flux, type ? { mimeType: type } : undefined);
  const morceaux: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) morceaux.push(e.data); };
  rec.start(1000);
  const couper = () => flux.getTracks().forEach(t => t.stop());
  return {
    debut: Date.now(),
    arreter: () => new Promise(ok => {
      rec.onstop = () => { couper(); ok(new Blob(morceaux, { type: rec.mimeType || "audio/webm" })); };
      rec.stop();
    }),
    annuler: () => { rec.onstop = couper; rec.stop(); }
  };
}

export async function transcrire(audio: Blob): Promise<string> {
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
