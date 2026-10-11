/* Copies de sécurité, dans « État de l'appli » : une par jour, gardées 7 jours, dans la tablette.
   Elles permettent de revenir en arrière après une fausse manœuvre ; elles ne protègent pas contre la perte de la tablette. */
import * as db from "./db";
import { confirmer, esc, toast } from "./ui";
import { formatOctets } from "./verifications";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

const jourLong = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit" }).replace(":", " h ");
const contenu = (c: db.Copie) => {
  const p = c.donnees.dossiers.length, s = c.donnees.seances.length;
  return `${p} patient${p > 1 ? "s" : ""}, ${s} séance${s > 1 ? "s" : ""}`;
};

let copies: db.Copie[] = [];

export async function afficherCopies() {
  try { copies = await db.listeCopies(); } catch { copies = []; }
  const jours = copies.filter(c => c.id !== db.AVANT_RETOUR);
  const taille = copies.reduce((t, c) => t + c.taille, 0);
  $("#copiesetat").textContent = jours.length
    ? `${jours.length} copie${jours.length > 1 ? "s" : ""} gardée${jours.length > 1 ? "s" : ""}, ${formatOctets(Math.max(taille, 1000))} occupés.`
    : "Pas encore de copie : la première se fera demain, avant votre premier changement.";
  $("#copies").innerHTML = copies.map(c => c.id === db.AVANT_RETOUR
    ? `<li class="avant"><div><b>Avant le dernier retour en arrière</b><span>${esc(jourLong(c.cree.slice(0, 10)))} à ${esc(heure(c.cree))} · ${esc(contenu(c))}</span></div>
        <button data-copie="${esc(c.id)}">Annuler le retour en arrière</button></li>`
    : `<li><div><b>${esc(jourLong(c.id))}</b><span>Début de journée · ${esc(contenu(c))}</span></div>
        <button data-copie="${esc(c.id)}">Revenir à cette copie</button></li>`).join("");
}

export function brancherCopies() {
  $("#copies").addEventListener("click", async e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copie]");
    const c = b && copies.find(x => x.id === b.dataset.copie);
    if (!c) return;
    const annuler = c.id === db.AVANT_RETOUR;
    const texte = annuler
      ? `Annuler le retour en arrière ? L'appli revient à l'état d'avant (${contenu(c)}).`
      : `Revenir à la copie du ${jourLong(c.id)} (début de journée) ? Ce qui a été ajouté ou modifié depuis disparaît : bilans, séances, rendez-vous. L'état actuel est gardé : vous pourrez annuler ce retour juste après, ici même.`;
    if (!await confirmer(texte, annuler ? "Annuler le retour" : "Revenir à cette copie")) return;
    try {
      await db.revenirA(c.id);
      toast(annuler ? "Retour en arrière annulé." : `Données remises au ${jourLong(c.id)}.`);
    } catch { toast("Le retour en arrière a échoué. Rien n'a été changé."); }
    afficherCopies();
  });
}

/* Copie du jour : à l'ouverture, au retour sur l'appli et régulièrement si elle reste ouverte la nuit.
   Les changements eux-mêmes la déclenchent aussi (db.ts), c'est donc un simple filet. */
export function surveillerCopies() {
  const faire = () => db.copieDuJour().catch(() => { /* réessayé à la prochaine occasion */ });
  faire();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) faire(); });
  setInterval(faire, 15 * 60 * 1000);
}
