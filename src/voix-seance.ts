/* « Enregistrer ma séance » dans le formulaire d'une séance, sur la fiche d'un patient.
   La voix part au Whisper du PC (comme la dictée groupée), le texte s'ajoute à la séance et la séance est enregistrée aussitôt
   (choix de Corentin : pas de relecture ; le texte dicté reste consultable et « Modifier » permet de corriger).
   Le bouton n'apparaît que si Whisper est joignable. Un enregistrement qui n'a pas pu être transcrit reste gardé. */
import * as db from "./db";
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
let apres: () => void = () => {};   // enregistre la séance une fois la voix transcrite
let dossier = "";                    // patient de la fiche ouverte

/* Un enregistrement pas encore transcrit est gardé dans la base de l'appareil (audit M1) : il survit à un changement
   d'écran, à la fermeture ou à la mise à jour de l'appli, et revient quand on rouvre « Dicter la séance » de ce patient. */
const GARDE = "voix_attente_seance";
type Garde = { dossierId: string; son: Blob; cree: string };
const garder = (son: Blob, dossierId: string) => db.ecrireParametre(GARDE, { dossierId, son, cree: new Date().toISOString() } satisfies Garde).catch(() => {});
const oublier = () => db.ecrireParametre(GARDE, undefined).catch(() => {});

const duree = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* un enregistrement ou une transcription en cours : la séance ne doit pas être enregistrée ni fermée sans le dire */
export const occupe = () => !!enCours || travail;

export function monter(z: HTMLElement, ta: HTMLTextAreaElement, enregistrer: () => void, dossierId = "") {
  zone = z; cible = ta; apres = enregistrer;
  if (dossierId !== dossier) { dossier = dossierId; if (!enCours && !travail) attente = null; }
  dessiner();
  if (!attente && !enCours && dossierId) db.lireParametre<Garde>(GARDE).then(g => {
    if (g?.son && g.dossierId === dossierId && !attente && !enCours && zone === z) { attente = g.son; erreur = ""; dessiner(); }
  }).catch(() => {});
  voix.disponible().then(ok => { if (ok !== dispo) { dispo = ok; dessiner(); } }).catch(() => {});
}

/* Le formulaire se ferme (autre patient, autre écran…) : un enregistrement en cours est arrêté et GARDÉ, jamais jeté ;
   il reviendra à la réouverture de « Dicter la séance » de ce patient. */
export function quitter(jeter = false) {
  clearInterval(chrono);
  const e = enCours, d = dossier;
  enCours = null;
  if (e && jeter) e.annuler();
  else if (e) e.arreter().then(son => { if (son.size && d) { garder(son, d); toast("Enregistrement arrêté et gardé : rouvrez « Dicter la séance » de ce patient pour le transcrire."); } });
  attente = null; erreur = ""; zone = null; cible = null;
}

function dessiner() {
  if (!zone) return;
  zone.innerHTML = enCours
    ? `<div class="voix enreg" role="status"><span class="point" aria-hidden="true"></span> Enregistrement <span id="svchrono">${voix.chrono(enCours, duree)}</span>
        <button class="primary" id="svarreter">Arrêter et transcrire</button><button id="svannuler">Annuler</button></div>`
    : travail ? `<div class="wait encours" role="status">Transcription de votre voix sur le PC…</div>`
    : attente ? `<div class="wait">Un enregistrement de votre voix est gardé : il n'a pas encore été transcrit.${erreur ? `<br><small>${esc(erreur)}</small>` : ""}
        <div class="row" style="margin-top:10px"><button class="primary" id="svreessayer">Réessayer la transcription</button><button id="svoublier">L'effacer</button></div></div>`
    : dispo ? `<div class="row"><button class="primary voixbtn" id="svenreg">🎙️ Enregistrer ma séance</button></div>` : "";
  brancher(zone);
}

function brancher(z: HTMLElement) {
  const enreg = z.querySelector<HTMLElement>("#svenreg");
  if (enreg) enreg.onclick = async () => {
    try { enCours = await voix.enregistrer(); } catch (e) { toast(e instanceof ErreurIA ? e.message : "Le micro n'a pas pu démarrer."); return; }
    chrono = setInterval(() => { const c = document.querySelector("#svchrono"); if (c && enCours) c.textContent = voix.chrono(enCours, duree); }, 1000);
    dessiner();
  };
  const arreter = z.querySelector<HTMLElement>("#svarreter");
  if (arreter) arreter.onclick = async () => {
    const e = enCours; if (!e) return;
    clearInterval(chrono); enCours = null;
    attente = await e.arreter();
    if (dossier) await garder(attente, dossier);   // gardé tant qu'il n'est pas transcrit
    transcrire();
  };
  const annuler = z.querySelector<HTMLElement>("#svannuler");
  if (annuler) annuler.onclick = () => { clearInterval(chrono); enCours?.annuler(); enCours = null; dessiner(); };
  const re = z.querySelector<HTMLElement>("#svreessayer");
  if (re) re.onclick = transcrire;
  const oub = z.querySelector<HTMLElement>("#svoublier");
  if (oub) oub.onclick = async () => { if (await confirmer("Effacer cet enregistrement ? Il n'a pas été transcrit.", "L'effacer")) { attente = null; erreur = ""; oublier(); dessiner(); } };
}

async function transcrire() {
  if (!attente) return;
  const son = attente, ta = cible;
  travail = true; dessiner();
  try {
    const t = await voix.transcrire(son);
    if (attente === son) attente = null;
    oublier();
    erreur = "";
    travail = false; dessiner();
    if (ta && ta.isConnected) {
      ta.value = ta.value.trim() ? ta.value.trimEnd() + "\n" + t : t;
      ta.dispatchEvent(new Event("input"));   // « À venir repéré » se met à jour
      apres();
    }
    return;
  } catch (e) { erreur = e instanceof ErreurIA ? e.message : "La transcription a échoué."; toast(erreur); }
  travail = false; dessiner();
}
