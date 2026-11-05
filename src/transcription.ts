/* Dictée enregistrée puis transcrite par Whisper.
   Appareil relié au PC : la voix part au PC (par Tailscale), où Whisper la transcrit ; elle ne sort pas de chez Corentin.
   Sinon, secours : le serveur de l'appli, s'il a un Whisper branché (variable WHISPER_URL sur Railway).
   Le texte revient dans la dictée. Sans Whisper joignable, le bouton n'apparaît pas. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import { indiceVoix, nettoyerVoix, sansRepetition } from "./regles";
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

/* Transcription en direct (1.5.0, choix de Corentin du 5 novembre 2026) : pendant l'enregistrement, la voix est coupée
   en morceaux aux pauses (30 s au moins, 60 s au plus) et chaque morceau part au Whisper du PC aussitôt. Le texte
   s'affiche au fil de la dictée ; à l'arrêt il ne reste que le dernier morceau à transcrire. Whisper reçoit les patients
   du jour et la fin du morceau précédent (indice). Un morceau sans voix n'est pas envoyé. L'enregistrement complet
   continue à côté : si un morceau échoue deux fois, ou si le PC n'est pas joignable, on retombe sur la transcription
   de tout l'enregistrement à la fin, comme avant. Seulement vers le PC : les noms ne partent jamais sur Railway. */
export type Direct = { noms: string[]; surTexte: (texte: string) => void };
type Reglage = { min: number; max: number; pause: number; voix: number };
const reglage = (): Reglage => ({ min: 30_000, max: 60_000, pause: 600, voix: 6,
  ...((globalThis as { __MUNINN_DIRECT__?: Partial<Reglage> }).__MUNINN_DIRECT__ ?? {}) });   // les tests d'écran raccourcissent

export type Enregistrement = {
  arreter: () => Promise<Blob>; annuler: () => void; debut: number; coupe: () => boolean;
  /* après arreter() : le texte transcrit en direct, ou null s'il faut transcrire tout l'enregistrement */
  texteDirect: () => Promise<string | null>;
};

/* texte du chrono : la durée, ou l'avis que la tablette a coupé le micro (ce qui a été dit avant reste gardé) */
export function chrono(e: Enregistrement, duree: (ms: number) => string) {
  return e.coupe() ? "coupé par la tablette (écran éteint ?). Touchez « Arrêter et transcrire » : le début est gardé." : duree(Date.now() - e.debut);
}

type Morceau = { son: Blob | null; texte: string | null; fini: Promise<void> };

function demarrerDirect(flux: MediaStream, mime: string | undefined, d: Direct) {
  const R = reglage();
  const Ctx = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctx) return null;
  let ctx: AudioContext, analyse: AnalyserNode;
  try { ctx = new Ctx(); analyse = ctx.createAnalyser(); analyse.fftSize = 1024; ctx.createMediaStreamSource(flux).connect(analyse); }
  catch { return null; }
  const pret = (async () => { const p = await pc(); return p && (await etatPC())?.pret ? p : null; })();
  const morceaux: Morceau[] = [];
  let annule = false, chaine: Promise<void> = Promise.resolve();
  const texteAvant = (m: Morceau) => morceaux.slice(0, morceaux.indexOf(m)).map(x => x.texte ?? "").filter(Boolean).join(" ");
  const tout = () => morceaux.map(x => x.texte ?? "").filter(Boolean).join(" ");

  const transcrireMorceau = async (m: Morceau) => {
    const p = await pret;
    if (!p || !m.son || annule) return;
    try {
      const avant = texteAvant(m);
      const t = sansRepetition(avant, nettoyerVoix(await versPC(p, m.son, indiceVoix(d.noms, avant), 3 * 60_000)));
      m.texte = t; if (t) m.son = null;   // transcrit : le son du morceau n'est plus utile
      if (!annule) d.surTexte(tout());
    } catch { /* gardé pour un nouvel essai à l'arrêt */ }
  };

  /* un morceau = un enregistreur à part, relancé à chaque coupure : chaque morceau est un fichier son complet */
  let courant: { rec: MediaRecorder; parts: Blob[]; voix: number; debut: number } | null = null;
  const nouveau = () => {
    const rec = new MediaRecorder(flux, mime ? { mimeType: mime } : undefined);
    const s = { rec, parts: [] as Blob[], voix: 0, debut: Date.now() };
    let fin: () => void = () => {};
    const m: Morceau = { son: null, texte: null, fini: new Promise(r => fin = r) };
    rec.ondataavailable = e => { if (e.data.size) s.parts.push(e.data); };
    rec.onstop = () => {
      if (courant === s) courant = null;
      if (!annule && s.voix >= R.voix && s.parts.length) {   // sans voix (silence, bruit) : pas envoyé
        m.son = new Blob(s.parts, { type: rec.mimeType || "audio/webm" });
        morceaux.push(m);
        chaine = chaine.then(() => transcrireMorceau(m));
      }
      fin();
    };
    attentes.push(m.fini);
    try { rec.start(1000); } catch { fin(); return; }
    courant = s;
  };
  const attentes: Promise<void>[] = [];
  const couper = (relancer: boolean) => {
    const s = courant; if (!s) return;
    if (relancer) nouveau(); else courant = null;
    try { s.rec.stop(); } catch { /* déjà arrêté */ }
  };

  /* niveau du son toutes les 50 ms ; le bruit de fond est suivi pour reconnaître une pause */
  const buf = new Float32Array(analyse.fftSize);
  let fond = 0.01, silence = 0;
  const minuterie = setInterval(() => {
    if (!courant) return;
    analyse.getFloatTimeDomainData(buf);
    let somme = 0; for (const v of buf) somme += v * v;
    const niveau = Math.sqrt(somme / buf.length);
    fond = niveau < fond ? Math.max(niveau, 0.0005) : fond + (niveau - fond) * 0.002;
    if (niveau > Math.max(0.006, fond * 3)) { courant.voix++; silence = 0; } else silence += 50;
    const age = Date.now() - courant.debut;
    if ((age >= R.min && silence >= R.pause) || age >= R.max) couper(true);
  }, 50);
  nouveau();

  const fermer = () => { clearInterval(minuterie); ctx.close().catch(() => {}); };
  return {
    arreter: () => { couper(false); fermer(); },
    annuler: () => { annule = true; couper(false); fermer(); },
    texte: async (): Promise<string | null> => {
      await Promise.all(attentes);
      await chaine;
      if (!(await pret)) return null;
      for (const m of morceaux) if (m.son && m.texte == null) await transcrireMorceau(m);   // filet : un nouvel essai
      if (!morceaux.length || morceaux.some(m => m.son && m.texte == null)) return null;
      return tout() || null;
    }
  };
}

/* démarre le micro ; arreter() rend l'enregistrement, qui reste dans la tablette tant qu'il n'est pas transcrit.
   direct : transcription au fil de la dictée (seulement si le PC est relié et Whisper prêt) */
export async function enregistrer(direct?: Direct): Promise<Enregistrement> {
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
  let d: ReturnType<typeof demarrerDirect> = null;
  try { d = direct ? demarrerDirect(flux, type, direct) : null; } catch { d = null; }
  const relacher = eveil();
  const couper = () => { d?.arreter(); relacher(); flux.getTracks().forEach(t => t.stop()); };
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
    annuler: () => { fini = null; d?.annuler(); couper(); try { if (rec.state !== "inactive") rec.stop(); } catch { /* déjà arrêté */ } },
    texteDirect: async () => {
      if (!d) return null;
      const relacherT = eveil();
      try { return await d.texte(); } catch { return null; } finally { relacherT(); }
    }
  };
}

/* envoie un son au Whisper du PC ; indice : patients du jour et fin du texte précédent (ignoré par un PC pas à jour) */
async function versPC(p: { adresse: string; code: string }, audio: Blob, indice: ReturnType<typeof indiceVoix>, delai?: number): Promise<string> {
  const q = indice ? "?indice=" + encodeURIComponent(JSON.stringify(indice)) : "";
  let r: Response;
  try {
    r = await fetch(p.adresse + "/api/voix/transcrire" + q, { method: "POST", headers: { Authorization: "Bearer " + p.code, "Content-Type": audio.type || "audio/webm" }, body: audio,
      signal: delai ? AbortSignal.timeout(delai) : undefined });
  } catch { throw new ErreurIA("Le PC est injoignable. L'enregistrement est gardé : réessayez."); }
  let corps: { texte?: string; erreur?: string } = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) throw new ErreurIA(corps.erreur || `Le PC a répondu par une erreur (${r.status}).`);
  return corps.texte || "";   // réponse sans texte : rien compris (silence, bruit)
}

/* noms : patients du jour, donnés au Whisper du PC seulement (jamais au secours sur Railway) */
export async function transcrire(audio: Blob, noms: string[] = []): Promise<string> {
  const relacher = eveil();
  try { return await transcrireSansVeille(audio, noms); } finally { relacher(); }
}

async function transcrireSansVeille(audio: Blob, noms: string[]): Promise<string> {
  const p = await pc();
  if (p && (await etatPC())?.pret) {
    const t = nettoyerVoix(await versPC(p, audio, indiceVoix(noms)));
    if (!t) throw new ErreurIA("Rien n'a été compris dans l'enregistrement.");
    return t;
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
