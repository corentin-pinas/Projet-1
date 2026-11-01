/* « Enregistrer ma séance » dans le formulaire d'une séance, sur la fiche d'un patient.
   La voix part au Whisper du PC (comme la dictée groupée) et le texte s'ajoute à la séance, à relire avant d'enregistrer.
   Le bouton n'apparaît que si Whisper est joignable. Un enregistrement qui n'a pas pu être transcrit reste gardé. */
import { ErreurIA } from "./ia";
import * as voix from "./transcription";
import { confirmer, esc, toast } from "./ui";

let dispo = false;
let enCours: voix.Enregistrement | null = null;
let attente: Blob | null = null;     // enregistré, pas encore transcrit
let travail = false;                 // transcription en cours
let erreur = "";
let chrono: ReturnType<typeof setInterval> | undefined;
let zone: HTMLElement | null = null, cible: HTMLTextAreaElement | null = null;

const duree = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* un enregistrement ou une transcription en cours : la séance ne doit pas être enregistrée ni fermée sans le dire */
export const occupe = () => !!enCours || travail;

export function monter(z: HTMLElement, ta: HTMLTextAreaElement) {
  zone = z; cible = ta;
  dessiner();
  voix.disponible().then(ok => { if (ok !== dispo) { dispo = ok; dessiner(); } }).catch(() => {});
}

/* le formulaire se ferme : micro coupé, enregistrement en attente oublié */
export function quitter() {
  clearInterval(chrono);
  enCours?.annuler(); enCours = null;
  attente = null; erreur = ""; zone = null; cible = null;
}

function dessiner() {
  if (!zone) return;
  zone.innerHTML = enCours
    ? `<div class="voix enreg" role="status"><span class="point" aria-hidden="true"></span> Enregistrement <span id="svchrono">${duree(Date.now() - enCours.debut)}</span>
        <button class="primary" id="svarreter">Arrêter et transcrire</button><button id="svannuler">Annuler</button></div>`
    : travail ? `<div class="wait encours" role="status">Transcription de votre voix sur le PC…</div>`
    : attente ? `<div class="wait">L'enregistrement n'a pas pu être transcrit. Il est gardé.${erreur ? `<br><small>${esc(erreur)}</small>` : ""}
        <div class="row" style="margin-top:10px"><button class="primary" id="svreessayer">Réessayer la transcription</button><button id="svoublier">L'effacer</button></div></div>`
    : dispo ? `<div class="row"><button class="primary voixbtn" id="svenreg">🎙️ Enregistrer ma séance</button></div>` : "";
  brancher(zone);
}

function brancher(z: HTMLElement) {
  const enreg = z.querySelector<HTMLElement>("#svenreg");
  if (enreg) enreg.onclick = async () => {
    try { enCours = await voix.enregistrer(); } catch (e) { toast(e instanceof ErreurIA ? e.message : "Le micro n'a pas pu démarrer."); return; }
    chrono = setInterval(() => { const c = document.querySelector("#svchrono"); if (c && enCours) c.textContent = duree(Date.now() - enCours.debut); }, 1000);
    dessiner();
  };
  const arreter = z.querySelector<HTMLElement>("#svarreter");
  if (arreter) arreter.onclick = async () => {
    const e = enCours; if (!e) return;
    clearInterval(chrono); enCours = null;
    attente = await e.arreter();
    transcrire();
  };
  const annuler = z.querySelector<HTMLElement>("#svannuler");
  if (annuler) annuler.onclick = () => { clearInterval(chrono); enCours?.annuler(); enCours = null; dessiner(); };
  const re = z.querySelector<HTMLElement>("#svreessayer");
  if (re) re.onclick = transcrire;
  const oub = z.querySelector<HTMLElement>("#svoublier");
  if (oub) oub.onclick = async () => { if (await confirmer("Effacer cet enregistrement ? Il n'a pas été transcrit.", "L'effacer")) { attente = null; erreur = ""; dessiner(); } };
}

async function transcrire() {
  if (!attente) return;
  const son = attente, ta = cible;
  travail = true; dessiner();
  try {
    const t = await voix.transcrire(son);
    if (ta && ta.isConnected) {
      ta.value = ta.value.trim() ? ta.value.trimEnd() + "\n" + t : t;
      ta.dispatchEvent(new Event("input"));   // « À venir repéré » se met à jour
      toast("Séance transcrite. Relisez-la, puis touchez « Enregistrer la séance ».");
    }
    if (attente === son) attente = null;
    erreur = "";
  } catch (e) { erreur = e instanceof ErreurIA ? e.message : "La transcription a échoué."; toast(erreur); }
  travail = false; dessiner();
}
