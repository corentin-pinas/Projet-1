/* « Enregistrer ma séance » dans le formulaire d'une séance, sur la fiche d'un patient.
   La voix part au Whisper du PC (comme la dictée groupée), le texte s'ajoute à la séance et la séance est enregistrée aussitôt
   (choix de Corentin : pas de relecture ; le texte dicté reste consultable et « Modifier » permet de corriger).
   Le bouton n'apparaît que si Whisper est joignable. L'enregistreur lui-même est commun avec la dictée (src/enregistreur.ts). */
import * as db from "./db";
import { Enregistreur } from "./enregistreur";
import { toast } from "./ui";

let zone: HTMLElement | null = null, cible: HTMLTextAreaElement | null = null;
let apres: () => void = () => {};   // enregistre la séance une fois la voix transcrite
let dossier = "";                    // patient de la fiche ouverte
let nom = "";                        // son nom, donné à Whisper

/* Un enregistrement pas encore transcrit est gardé dans la base de l'appareil (audit M1) : il survit à un changement
   d'écran, à la fermeture ou à la mise à jour de l'appli, et revient quand on rouvre « Dicter la séance » de ce patient. */
const GARDE = "voix_attente_seance";
type Garde = { dossierId: string; son: Blob; cree: string };

const garder = async (son: Blob, dossierId: string) => { if (dossierId) await db.ecrireParametre(GARDE, { dossierId, son, cree: new Date().toISOString() } satisfies Garde); };

const enr = new Enregistreur({
  id: "sv", libelle: "Enregistrer ma séance", enTranscription: "Transcription de votre voix sur le PC…",
  noms: async () => nom ? [nom] : [],
  garder: son => garder(son, dossier),
  oublier: () => db.ecrireParametre(GARDE, undefined),
  transcrit: t => {
    const ta = cible;
    if (!ta || !ta.isConnected) return;
    ta.value = ta.value.trim() ? ta.value.trimEnd() + "\n" + t : t;
    ta.dispatchEvent(new Event("input"));   // « À venir repéré » se met à jour
    apres();
  },
  redessiner: () => dessiner()
});

/* un enregistrement ou une transcription en cours : la séance ne doit pas être enregistrée ni fermée sans le dire */
export const occupe = () => enr.occupe();
/* le micro tourne en ce moment (pas seulement une transcription en cours) */
export const enregistre = () => !!enr.enCours;

export function monter(z: HTMLElement, ta: HTMLTextAreaElement, enregistrer: () => void, dossierId = "", nomPatient = "") {
  zone = z; cible = ta; apres = enregistrer; nom = nomPatient;
  if (dossierId !== dossier) { dossier = dossierId; if (!enr.occupe()) enr.attente = null; }
  dessiner();
  if (!enr.attente && !enr.enCours && dossierId) db.lireParametre<Garde>(GARDE).then(g => {
    if (g?.son && g.dossierId === dossierId && !enr.attente && !enr.enCours && zone === z) { enr.attente = g.son; enr.erreur = ""; dessiner(); }
  }).catch(() => {});
  enr.verifierDispo();
}

/* Le formulaire se ferme (autre patient, autre écran…) : un enregistrement en cours est arrêté et GARDÉ, jamais jeté ;
   il reviendra à la réouverture de « Dicter la séance » de ce patient. jeter : après « Annuler » confirmé. */
export function quitter(jeter = false) {
  const d = dossier;   // le patient de ce formulaire, même si un autre est ouvert d'ici la fin de l'arrêt
  enr.quitter(jeter).then(async son => {
    if (!son || !d) return;
    await garder(son, d).catch(() => {});
    toast("Enregistrement arrêté et gardé : rouvrez « Dicter la séance » de ce patient pour le transcrire.");
  });
  enr.attente = null; enr.erreur = ""; zone = null; cible = null;
}

function dessiner() {
  if (!zone) return;
  zone.innerHTML = enr.html();
  enr.brancher(zone);
}
