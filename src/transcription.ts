/* Dictée enregistrée puis transcrite par Whisper (branchement prévu pour l'arrivée du PC de Corentin).
   La tablette enregistre la voix, l'envoie au serveur de l'appli, qui la passe à Whisper ; le texte revient dans la dictée.
   Tant que Whisper n'est pas réglé sur le serveur (variable WHISPER_URL), le bouton n'apparaît pas. */
import * as db from "./db";
import { ErreurIA } from "./ia";

const code = () => db.lireParametre<string>("code_acces");

/* le serveur sait-il transcrire ? (abonnement réglé et Whisper branché) */
export async function disponible(): Promise<boolean> {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return false;
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
