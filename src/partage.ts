/* « Partage avec le PC », dans « État de l'appli » : relier l'appareil au PC (adresse + code), voir où en est l'échange.
   Sous les boutons de gauche, une petite ligne rappelle l'état du partage ; la toucher ouvre « État de l'appli ». */
import * as synchro from "./synchro";
import { etatPC } from "./transcription";
import { $, confirmer, toast } from "./ui";


const depuis = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : `il y a ${j} jours`;
};

/* dictée à la voix : Whisper est-il prêt sur le PC ? (vérifié à l'ouverture d'« État de l'appli ») */
export async function afficherVoix() {
  const el = $("#syncvoix");
  if (!synchro.etatSync().relie) { el.textContent = ""; return; }
  const v = await etatPC();
  el.textContent = !v ? "" : v.pret ? "Dictée à la voix : Whisper est prêt sur le PC." : v.installee
    ? "Dictée à la voix : Whisper se prépare sur le PC (téléchargement du modèle, 5 à 15 minutes la première fois)."
    : "Dictée à la voix : Whisper n'est pas installé sur le PC. Relancez l'installation de Muninn sur le PC (ligne ci-dessous).";
}

/* Bandeau « pas encore partagés » (1.7.0, choix de Corentin du 11 novembre 2026) : un changement de cet appareil attend
   depuis plus de 30 minutes et le PC ne répond pas (PC en veille ou éteint, Tailscale coupé sur l'appareil). */
export const ATTENTE_ALERTE_MIN = 30;
export function alerteAttente(e: synchro.EtatSync, maintenant = Date.now()): string | null {
  if (!e.relie || e.enCours || !e.erreur || !e.attente) return null;
  if (maintenant - new Date(e.attente).getTime() < ATTENTE_ALERTE_MIN * 60_000) return null;
  return `⚠ Des changements de cet appareil ne sont pas encore partagés avec le PC (${depuis(e.attente).replace(/^il y a/, "depuis")}). Le PC est-il allumé ? Tailscale est-il actif sur cet appareil ?`;
}

/* mise à jour automatique du PC (1.7.0) : ce que le lanceur du PC a noté */
export function texteMajPC(pc: synchro.EtatSync["pc"]): string {
  if (!pc) return "";
  const m = pc.maj;
  if (!m) return "Mise à jour automatique du PC : pas encore installée. Relancez une fois la ligne d'installation sur le PC (ci-dessous).";
  if (m.relancer) return "Le PC a besoin d'une nouvelle installation : relancez la ligne d'installation sur le PC (ci-dessous).";
  const faite = m.faites?.[0];
  const recente = faite && Date.now() - new Date(faite.quand).getTime() < 7 * 86_400_000
    ? ` Dernière mise à jour : ${depuis(faite.quand)} (${faite.nom === "voix" ? "Whisper" : faite.nom === "travail" ? "travail en tâche de fond" : "partage"}).` : "";
  /* 1.9.0 : le PC range les dictées en tâche de fond */
  const travail = pc.travail?.pret ? ` Il range vos dictées en tâche de fond${pc.travail.enCours ? ` (${pc.travail.enCours} en cours)` : ""}.` : "";
  return (m.erreur ? `Mise à jour du PC : le dernier essai n'a pas abouti (${m.erreur}).` : `Le PC se met à jour tout seul (version ${pc.version}).`) + travail + recente;
}

export function afficherPartage() {
  const e = synchro.etatSync();
  const alerte = alerteAttente(e);
  $("#alertesync").hidden = !alerte;
  if (alerte) $("#alertesynctxt").textContent = alerte;
  $("#syncmajpc").textContent = e.relie ? texteMajPC(e.pc) : "";
  const mini = $("#syncmini"), txt = $("#syncminitxt");
  mini.hidden = !e.relie;
  mini.classList.toggle("encours", e.enCours);
  mini.classList.toggle("alerte", !!e.erreur && !e.enCours);
  txt.textContent = e.enCours ? "Échange avec le PC…" : e.pcRevenu ? "PC revenu en arrière : à remettre à niveau" : e.erreur ? "PC pas joint" + (e.derniere ? " · à jour " + depuis(e.derniere) : "")
    : e.derniere ? "À jour avec le PC · " + depuis(e.derniere) : "Relié au PC";
  mini.title = e.erreur ?? "";

  $("#syncform").hidden = e.relie;
  $("#syncactions").hidden = !e.relie;
  $("#syncrevenu").hidden = !(e.relie && e.pcRevenu && !e.enCours);
  $("#syncetat").textContent = !e.relie ? "Cet appareil n'est pas relié au PC."
    : e.enCours ? "Échange en cours avec le PC…"
    : e.pcRevenu ? e.erreur ?? ""
    : e.erreur ? e.erreur + (e.derniere ? ` Dernier échange réussi : ${depuis(e.derniere)}.` : "") + " Vos changements restent dans cet appareil et partiront au prochain échange."
    : e.derniere ? `Relié au PC. Dernier échange : ${depuis(e.derniere)}.` : "Relié au PC.";
  const commande = `irm ${location.origin}/pc/installer.ps1 | iex`;
  $("#synccommande").textContent = commande;
  $("#syncappli").textContent = location.origin;
}

export function brancherPartage() {
  synchro.abonner(afficherPartage);
  setInterval(afficherPartage, 60_000);   // « il y a 3 min » avance tout seul
  $("#etatbtn").addEventListener("click", () => { afficherVoix(); });
  $("#syncmini").addEventListener("click", () => { afficherVoix(); $<HTMLDialogElement>("#etatdlg").showModal(); $("#synctitre").scrollIntoView({ block: "start" }); });

  $("#syncrelier").addEventListener("click", async () => {
    const adresse = $<HTMLInputElement>("#syncadresse").value, code = $<HTMLInputElement>("#synccode").value;
    if (!adresse.trim() || !code.trim()) { toast("Tapez l'adresse et le code affichés sur le PC."); return; }
    const b = $<HTMLButtonElement>("#syncrelier");
    b.disabled = true; b.textContent = "Connexion au PC…";
    try {
      await synchro.relier(adresse, code);
      $<HTMLInputElement>("#synccode").value = "";
      afficherVoix();
      const e = synchro.etatSync();
      toast(e.erreur ? "Relié au PC, mais le premier échange n'a pas abouti : " + e.erreur : "Relié au PC : les données sont échangées.");
    } catch (err) {
      toast(err instanceof synchro.ErreurSync ? err.message : "Le PC n'a pas pu être joint.");
    } finally {
      b.disabled = false; b.textContent = "Relier au PC";
    }
  });

  $("#alertesyncessai").addEventListener("click", async () => {
    await synchro.synchroniser();
    const e = synchro.etatSync();
    toast(e.erreur ? "Le PC ne répond toujours pas : " + e.erreur : "Échange fait : tout est partagé.");
  });

  $("#syncmaintenant").addEventListener("click", async () => {
    await synchro.synchroniser();
    const e = synchro.etatSync();
    toast(e.erreur ?? "Échange fait : cet appareil est à jour.");
  });

  $("#syncremettre").addEventListener("click", async () => {
    if (!(await confirmer("Renvoyer au PC tout ce que contient cet appareil ? Faites-le depuis l'appareil le plus à jour. Ce que le PC avait en plus est gardé, et une copie de l'état du PC est mise de côté.", "Remettre le PC à niveau"))) return;
    try {
      await synchro.remettreLePCaNiveau();
      const e = synchro.etatSync();
      toast(e.erreur ?? "PC remis à niveau. Les autres appareils suivront à leur prochain échange.");
    } catch (err) {
      toast(err instanceof synchro.ErreurSync ? err.message : "La remise à niveau n'a pas abouti. Réessayez.");
    }
  });

  $("#syncdelier").addEventListener("click", async () => {
    if (!(await confirmer("Délier cet appareil du PC ? Il garde ses données, mais n'échangera plus rien avec le PC ni avec les autres appareils.", "Délier"))) return;
    await synchro.delier();
    toast("Appareil délié du PC.");
  });

  $("#synccopier").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#synccommande").textContent ?? ""); toast("Ligne copiée."); }
    catch { toast("Copie impossible : sélectionnez la ligne et copiez-la à la main."); }
  });

  afficherPartage();
}
