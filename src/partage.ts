/* « Partage avec le PC », dans « État de l'appli » : relier l'appareil au PC (adresse + code), voir où en est l'échange.
   Sous les boutons de gauche, une petite ligne rappelle l'état du partage ; la toucher ouvre « État de l'appli ». */
import * as synchro from "./synchro";
import { confirmer, toast } from "./ui";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

const depuis = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : `il y a ${j} jours`;
};

export function afficherPartage() {
  const e = synchro.etatSync();
  const mini = $("#syncmini"), txt = $("#syncminitxt");
  mini.hidden = !e.relie;
  mini.classList.toggle("encours", e.enCours);
  mini.classList.toggle("alerte", !!e.erreur && !e.enCours);
  txt.textContent = e.enCours ? "Échange avec le PC…" : e.erreur ? "PC pas joint" + (e.derniere ? " · à jour " + depuis(e.derniere) : "")
    : e.derniere ? "À jour avec le PC · " + depuis(e.derniere) : "Relié au PC";
  mini.title = e.erreur ?? "";

  $("#syncform").hidden = e.relie;
  $("#syncactions").hidden = !e.relie;
  $("#syncetat").textContent = !e.relie ? "Cet appareil n'est pas relié au PC."
    : e.enCours ? "Échange en cours avec le PC…"
    : e.erreur ? e.erreur + (e.derniere ? ` Dernier échange réussi : ${depuis(e.derniere)}.` : "") + " Vos changements restent dans cet appareil et partiront au prochain échange."
    : e.derniere ? `Relié au PC. Dernier échange : ${depuis(e.derniere)}.` : "Relié au PC.";
  const commande = `irm ${location.origin}/pc/installer.ps1 | iex`;
  $("#synccommande").textContent = commande;
  $("#syncappli").textContent = location.origin;
}

export function brancherPartage() {
  synchro.abonner(afficherPartage);
  setInterval(afficherPartage, 60_000);   // « il y a 3 min » avance tout seul
  $("#syncmini").addEventListener("click", () => { $<HTMLDialogElement>("#etatdlg").showModal(); $("#synctitre").scrollIntoView({ block: "start" }); });

  $("#syncrelier").addEventListener("click", async () => {
    const adresse = $<HTMLInputElement>("#syncadresse").value, code = $<HTMLInputElement>("#synccode").value;
    if (!adresse.trim() || !code.trim()) { toast("Tapez l'adresse et le code affichés sur le PC."); return; }
    const b = $<HTMLButtonElement>("#syncrelier");
    b.disabled = true; b.textContent = "Connexion au PC…";
    try {
      await synchro.relier(adresse, code);
      $<HTMLInputElement>("#synccode").value = "";
      const e = synchro.etatSync();
      toast(e.erreur ? "Relié au PC, mais le premier échange n'a pas abouti : " + e.erreur : "Relié au PC : les données sont échangées.");
    } catch (err) {
      toast(err instanceof synchro.ErreurSync ? err.message : "Le PC n'a pas pu être joint.");
    } finally {
      b.disabled = false; b.textContent = "Relier au PC";
    }
  });

  $("#syncmaintenant").addEventListener("click", async () => {
    await synchro.synchroniser();
    const e = synchro.etatSync();
    toast(e.erreur ?? "Échange fait : cet appareil est à jour.");
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
