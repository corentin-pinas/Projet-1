/* Copies de sécurité, dans « État de l'appli » : une par jour, gardées 7 jours, dans la tablette.
   Elles permettent de revenir en arrière après une fausse manœuvre ; elles ne protègent pas contre la perte de la tablette. */
import * as db from "./db";
import { confirmer, esc, toast } from "./ui";
import { chiffrer, dechiffrer, ErreurCopie } from "./fichier-copie";
import { isoDay } from "./regles";
import { formatOctets } from "./verifications";

export const PARAM_COPIE_EXTERNE = "copie_externe";   // date (ISO) de la dernière copie hors de Chrome
const PARAM_MDP = "mdp_copies";                         // mot de passe des copies, retenu par la tablette

type Entete = { format: 1; cree: string; donnees: db.Donnees; fichiers: string[] };

/* nombre de jours entiers (calendrier) depuis une date ISO ; null si jamais */
export function joursDepuis(iso: string | undefined, maintenant = new Date()): number | null {
  if (!iso) return null;
  const jour = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((jour(maintenant) - jour(new Date(iso))) / 864e5);
}

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
  afficherExterne();
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

/* ---------- copie hors de Chrome ---------- */

async function afficherExterne() {
  const j = joursDepuis(await db.lireParametre<string>(PARAM_COPIE_EXTERNE).catch(() => undefined));
  $("#extetat").textContent = j === null ? "Aucune copie hors de Chrome pour l'instant."
    : `Dernière copie hors de Chrome : ${j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`}.`;
}

async function copierDehors(mdp: string, rafraichir: () => void) {
  const btn = $<HTMLButtonElement>("#extcopier");
  btn.disabled = true; btn.textContent = "Copie en cours…";
  try {
    const e = await db.exporter();
    const entete: Entete = { format: 1, cree: new Date().toISOString(), donnees: e.donnees, fichiers: e.fichiers.map(f => f.id) };
    const fichier = await chiffrer({ entete, fichiers: e.fichiers.map(f => f.blob) }, mdp);
    const nom = `mes-patients-${isoDay(new Date())}.sauvegarde`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(fichier); a.download = nom;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    await db.ecrireParametre(PARAM_COPIE_EXTERNE, new Date().toISOString());
    toast(`Copie enregistrée dans « Téléchargements » : ${nom} (${formatOctets(Math.max(fichier.size, 1000))}).`);
  } catch (err) {
    console.error("Copie hors de Chrome :", err);
    toast("La copie a échoué. Vos données n'ont pas changé. Réessayez.");
  } finally {
    btn.disabled = false; btn.textContent = "Copier hors de Chrome";
    afficherExterne(); rafraichir();
  }
}

let aRestaurer: File | null = null;

/* Ouvre la copie, montre ce qu'elle contient, puis remplace les données après confirmation. Faux : mauvais mot de passe. */
async function restaurer(fichier: File, mdp: string): Promise<boolean> {
  let contenu;
  try { contenu = await dechiffrer<Entete>(fichier, mdp); }
  catch (e) {
    if (e instanceof ErreurCopie && e.raison === "mot-de-passe") return false;
    toast(e instanceof ErreurCopie && e.raison === "format" ? "Ce fichier n'est pas une copie de l'appli." : "Cette copie est abîmée et ne peut pas être ouverte.");
    return true;
  }
  const { entete, fichiers } = contenu;
  const p = entete.donnees.dossiers.length, s = entete.donnees.seances.length;
  const quand = new Date(entete.cree).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const ok = await confirmer(`Remplacer les données de cette tablette par la copie du ${quand} (${p} patient${p > 1 ? "s" : ""}, ${s} séance${s > 1 ? "s" : ""}) ? Les données actuelles sont gardées : « Annuler le retour en arrière » les remet.`, "Restaurer cette copie");
  if (!ok) return true;
  try {
    await db.importer({ donnees: entete.donnees, fichiers: entete.fichiers.map((id, i) => ({ id, blob: fichiers[i] })) });
    if (!await db.lireParametre(PARAM_MDP)) await db.ecrireParametre(PARAM_MDP, mdp);   // tablette neuve : le mot de passe resservira
    toast(`Copie du ${quand} restaurée.`);
  } catch { toast("La restauration a échoué. Rien n'a été changé."); }
  return true;
}

export function brancherCopies(rafraichir: () => void = () => {}) {
  const mdpform = $("#mdpform"), restform = $("#restform");
  $("#extcopier").addEventListener("click", async () => {
    const mdp = await db.lireParametre<string>(PARAM_MDP);
    if (mdp) return copierDehors(mdp, rafraichir);
    mdpform.hidden = false; $("#mdp1").focus();
  });
  $("#mdpannuler").addEventListener("click", () => { mdpform.hidden = true; });
  $("#mdpok").addEventListener("click", async () => {
    const a = $<HTMLInputElement>("#mdp1").value, b = $<HTMLInputElement>("#mdp2").value;
    if (a.length < 8) return toast("Le mot de passe doit faire 8 caractères au moins.");
    if (a !== b) return toast("Les deux mots de passe ne sont pas les mêmes.");
    await db.ecrireParametre(PARAM_MDP, a);
    $<HTMLInputElement>("#mdp1").value = $<HTMLInputElement>("#mdp2").value = "";
    mdpform.hidden = true;
    copierDehors(a, rafraichir);
  });

  $("#extrestaurer").addEventListener("click", () => $("#extfichier").click());
  $<HTMLInputElement>("#extfichier").addEventListener("change", async e => {
    const input = e.target as HTMLInputElement;
    aRestaurer = input.files?.[0] ?? null; input.value = "";
    if (!aRestaurer) return;
    const mdp = await db.lireParametre<string>(PARAM_MDP);
    if (mdp && await restaurer(aRestaurer, mdp)) { aRestaurer = null; afficherCopies(); return rafraichir(); }
    $("#restinfo").textContent = mdp ? "Cette copie a été faite avec un autre mot de passe. Tapez-le." : "Tapez le mot de passe des copies.";
    restform.hidden = false; $("#restmdp").focus();
  });
  $("#restannuler").addEventListener("click", () => { restform.hidden = true; aRestaurer = null; });
  $("#restok").addEventListener("click", async () => {
    const champ = $<HTMLInputElement>("#restmdp");
    if (!aRestaurer) return;
    if (!await restaurer(aRestaurer, champ.value)) return toast("Mot de passe incorrect.");
    champ.value = ""; restform.hidden = true; aRestaurer = null;
    afficherCopies(); rafraichir();
  });

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
    afficherCopies(); rafraichir();
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
