/* « Enregistrer ma séance » dans le formulaire d'une séance, sur la fiche d'un patient.
   La voix part au Whisper du PC (comme la dictée groupée), le texte s'ajoute à la séance et la séance est enregistrée aussitôt
   (choix de Corentin : pas de relecture ; le texte dicté reste consultable et « Modifier » permet de corriger).
   Le bouton n'apparaît que si Whisper est joignable. Un enregistrement qui n'a pas pu être transcrit reste gardé. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import { phrase, Relanceur } from "./relance";
import * as voix from "./transcription";
import { confirmer, esc, toast } from "./ui";

let dispo = false;
let enCours: voix.Enregistrement | null = null;
let attente: Blob | null = null;     // enregistré, pas encore transcrit
let travail = false;                 // transcription en cours
let erreur = "";
/* relance automatique de la transcription après un échec (5 min, 3 essais au plus), tant que le formulaire est ouvert */
const relance = new Relanceur(essai => { transcrire(undefined, essai); }, () => dessiner());
let chrono: ReturnType<typeof setInterval> | undefined;
let zone: HTMLElement | null = null, cible: HTMLTextAreaElement | null = null;
let apres: () => void = () => {};   // enregistre la séance une fois la voix transcrite
let dossier = "";                    // patient de la fiche ouverte
let nom = "";                        // son nom, donné à Whisper
let direct = "";                     // texte transcrit en direct pendant l'enregistrement (1.5.0)
const montrerDirect = (t: string) => {
  direct = t;
  const el = document.querySelector<HTMLElement>("#svdirect");
  if (el) { el.textContent = t; el.hidden = !t; el.scrollTop = el.scrollHeight; }
};

/* Un enregistrement pas encore transcrit est gardé dans la base de l'appareil (audit M1) : il survit à un changement
   d'écran, à la fermeture ou à la mise à jour de l'appli, et revient quand on rouvre « Dicter la séance » de ce patient. */
const GARDE = "voix_attente_seance";
type Garde = { dossierId: string; son: Blob; cree: string };
const garder = (son: Blob, dossierId: string) => db.ecrireParametre(GARDE, { dossierId, son, cree: new Date().toISOString() } satisfies Garde).catch(() => {});
const oublier = () => db.ecrireParametre(GARDE, undefined).catch(() => {});

const duree = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* un enregistrement ou une transcription en cours : la séance ne doit pas être enregistrée ni fermée sans le dire */
export const occupe = () => !!enCours || travail;

export function monter(z: HTMLElement, ta: HTMLTextAreaElement, enregistrer: () => void, dossierId = "", nomPatient = "") {
  zone = z; cible = ta; apres = enregistrer; nom = nomPatient;
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
  clearInterval(chrono); relance.annuler();
  const e = enCours, d = dossier;
  enCours = null;
  if (e && jeter) e.annuler();
  else if (e) e.arreter().then(son => { if (son.size && d) { garder(son, d); toast("Enregistrement arrêté et gardé : rouvrez « Dicter la séance » de ce patient pour le transcrire."); } });
  attente = null; erreur = ""; zone = null; cible = null; direct = "";
}

function dessiner() {
  if (!zone) return;
  zone.innerHTML = enCours
    ? `<div class="voix enreg" role="status"><span class="point" aria-hidden="true"></span> Enregistrement <span id="svchrono">${voix.chrono(enCours, duree)}</span>
        <button class="primary" id="svarreter">Arrêter et transcrire</button><button id="svannuler">Annuler</button></div>
       <div class="direct" id="svdirect" aria-live="polite" ${direct ? "" : "hidden"}>${esc(direct)}</div>`
    : travail ? `<div class="wait encours" role="status">Transcription de votre voix sur le PC…</div>`
    : attente ? `<div class="wait">Un enregistrement de votre voix est gardé : il n'a pas encore été transcrit.${erreur ? `<br><small>${esc(erreur)}</small>` : ""}${relance.plan ? `<br><small>${phrase(relance.plan)}</small>` : ""}
        <div class="row" style="margin-top:10px"><button class="primary" id="svreessayer">${relance.plan ? "Réessayer maintenant" : "Réessayer la transcription"}</button><button id="svoublier">L'effacer</button></div></div>`
    : dispo ? `<div class="row"><button class="primary voixbtn" id="svenreg">🎙️ Enregistrer ma séance</button></div>` : "";
  brancher(zone);
}

function brancher(z: HTMLElement) {
  const enreg = z.querySelector<HTMLElement>("#svenreg");
  if (enreg) enreg.onclick = async () => {
    direct = "";
    try { enCours = await voix.enregistrer({ noms: nom ? [nom] : [], surTexte: montrerDirect }); } catch (e) { toast(e instanceof ErreurIA ? e.message : "Le micro n'a pas pu démarrer."); return; }
    chrono = setInterval(() => { const c = document.querySelector("#svchrono"); if (c && enCours) c.textContent = voix.chrono(enCours, duree); }, 1000);
    dessiner();
  };
  const arreter = z.querySelector<HTMLElement>("#svarreter");
  if (arreter) arreter.onclick = async () => {
    const e = enCours; if (!e) return;
    clearInterval(chrono); enCours = null;
    attente = await e.arreter();
    if (dossier) await garder(attente, dossier);   // gardé tant qu'il n'est pas transcrit
    transcrire(e);
  };
  const annuler = z.querySelector<HTMLElement>("#svannuler");
  if (annuler) annuler.onclick = () => { clearInterval(chrono); enCours?.annuler(); enCours = null; direct = ""; dessiner(); };
  const re = z.querySelector<HTMLElement>("#svreessayer");
  if (re) re.onclick = () => { relance.annuler(); transcrire(); };
  const oub = z.querySelector<HTMLElement>("#svoublier");
  if (oub) oub.onclick = async () => { if (await confirmer("Effacer cet enregistrement ? Il n'a pas été transcrit.", "L'effacer")) { relance.annuler(); attente = null; erreur = ""; oublier(); dessiner(); } };
}

/* e : l'enregistrement qui vient d'être arrêté ; son texte transcrit en direct évite de tout retranscrire */
async function transcrire(e?: voix.Enregistrement, essai = 1) {
  relance.annuler();
  if (!attente || travail) return;
  const son = attente, ta = cible;
  travail = true; dessiner();
  try {
    const t = (e && await e.texteDirect()) || await voix.transcrire(son, nom ? [nom] : []);
    direct = "";
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
  } catch (err) {
    erreur = err instanceof ErreurIA ? err.message : "La transcription a échoué.";
    const p = relance.echec(err, essai);
    toast(erreur + (p ? (p.quand == null ? " Nouvel essai au retour du réseau." : " Nouvel essai dans 5 minutes.") : ""));
  }
  travail = false; dessiner();
}
