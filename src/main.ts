import "./styles.css";
import * as reglages from "./reglages";
import { installer as installerMascotte } from "./mascotte";

reglages.appliquer(reglages.lire());   // couleurs et taille du texte avant tout affichage
import { registerSW } from "virtual:pwa-register";
import { demarrer, rafraichirIA } from "./app";
import * as db from "./db";
import { afficherCopies, brancherCopies, joursDepuis, PARAM_COPIE_EXTERNE, surveillerCopies } from "./copies";
import { configIA } from "./moteur";
import * as alerteCode from "./alerte-code";
import * as exportDossier from "./export-dossier";
import * as fenetres from "./fenetres";
import { brancherPartage } from "./partage";
import * as synchro from "./synchro";
import { afficherIA, brancherReglagesIA } from "./reglages-ia";
import { $, toast, esc } from "./ui";
import { verifications, type EtatAppareil } from "./verifications";


let horsConnexionPret = !!navigator.serviceWorker?.controller;
let protectionRefusee = false;
let brave = false;

/* Mise à jour : jamais automatique, pour ne pas recharger l'écran au milieu d'une dictée.
   Un bandeau propose la nouvelle version ; elle s'installe aussi d'elle-même à la prochaine ouverture de l'appli. */
const majSW = registerSW({
  immediate: true,
  onNeedRefresh() { $("#maj").hidden = false; },
  onOfflineReady() { horsConnexionPret = true; afficherEtat(); },
  onRegistered(reg) { if (reg?.active) { horsConnexionPret = true; afficherEtat(); } }
});
$("#majbtn").addEventListener("click", () => { $<HTMLButtonElement>("#majbtn").disabled = true; majSW(true); });

/* Brave se signale par navigator.brave ; son message de refus n'est pas le même que celui des autres navigateurs. */
(navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave?.isBrave()
  .then(b => { brave = b; afficherEtat(); })
  .catch(() => {});

async function lireEtat(): Promise<EtatAppareil> {
  const installee = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches;
  let stockageProtege: boolean | null = null, espaceLibre: number | null = null;
  try { if (navigator.storage?.persisted) stockageProtege = await navigator.storage.persisted(); } catch { /* pas de réponse */ }
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      if (e.quota != null) espaceLibre = e.quota - (e.usage ?? 0);
    }
  } catch { /* pas de réponse */ }
  let cleIA = false, aDesDonnees = false, joursCopieExterne: number | null = null;
  try { cleIA = !!(await configIA()); } catch { /* base indisponible */ }
  try {
    aDesDonnees = (await db.tout()).dossiers.length > 0;
    joursCopieExterne = joursDepuis(await db.lireParametre<string>(PARAM_COPIE_EXTERNE));
  } catch { /* base indisponible */ }
  let joursPC: number | null = null;
  try { if (await db.lireParametre<string>(synchro.PARAM_ADRESSE)) joursPC = joursDepuis(await db.lireParametre<string>(synchro.PARAM_OK)); } catch { /* base indisponible */ }
  return { installee, horsConnexionPret, stockageProtege, espaceLibre, protectionRefusee, brave, cleIA, aDesDonnees, joursCopieExterne, joursPC };
}

/* Le bouton « État de l'appli » en bas de la liste devient orange dès qu'un point demande attention. */
async function afficherEtat() {
  const etat = await lireEtat();
  const v = verifications(etat);
  $("#checks").innerHTML = v.map(x => `
    <li class="verif${x.ok ? " ok" : ""}" data-id="${x.id}">
      <span class="pastille" aria-hidden="true">${x.ok ? "✓" : "!"}</span>
      <div><b>${esc(x.titre)}</b><span>${esc(x.detail)}</span></div>
    </li>`).join("");
  $("#persist").hidden = etat.stockageProtege !== false || protectionRefusee;
  if ($<HTMLDialogElement>("#etatdlg").open) await Promise.all([afficherIA(), afficherCopies()]);
  const reste = v.filter(x => !x.ok).length;
  $("#etatbtn").classList.toggle("alerte", reste > 0);
  $("#regbtn").classList.toggle("alerte", reste > 0);   // la roue dit qu'un point est à voir
  $("#regbtn").setAttribute("aria-label", reste ? `Réglages et état de l'appli : ${reste} point${reste > 1 ? "s" : ""} à voir` : "Réglages et état de l'appli");
  $("#etattxt").textContent = reste ? `État de l'appli : ${reste} point${reste > 1 ? "s" : ""} à voir` : "État de l'appli";
  return v;
}

brancherCopies(afficherEtat);
reglages.brancher();
exportDossier.brancher();
fenetres.brancher();
installerMascotte(document.querySelector<HTMLElement>("#mascotte")!);
/* la décoration de saison change d'elle-même si l'appli reste ouverte d'un jour à l'autre */
document.addEventListener("visibilitychange", () => { if (!document.hidden) reglages.appliquer(reglages.lire()); });
brancherReglagesIA(async () => { await afficherEtat(); rafraichirIA(); });

async function demanderProtection() {
  let ok = false;
  try { ok = await navigator.storage.persist(); } catch { /* traité comme un refus */ }
  protectionRefusee = !ok;
  return ok;
}

$("#version").textContent = __VERSION__;
$("#etatbtn").addEventListener("click", () => { $<HTMLDialogElement>("#regdlg").close(); $<HTMLDialogElement>("#etatdlg").showModal(); afficherEtat(); });
$("#etatclose").addEventListener("click", () => $<HTMLDialogElement>("#etatdlg").close());
$("#persist").addEventListener("click", async () => {
  const ok = await demanderProtection();
  await afficherEtat();
  toast(ok ? "Données protégées." : "Le navigateur a refusé. L'explication est dans l'encadré orange.");
});
$("#refresh").addEventListener("click", async () => {
  const reste = (await afficherEtat()).filter(v => !v.ok).length;
  toast(reste ? `Vérifié : ${reste} point${reste > 1 ? "s" : ""} encore en orange.` : "Vérifié : tout est au vert.");
});
matchMedia("(display-mode: standalone)").addEventListener("change", afficherEtat);

/* Une appli installée demande d'emblée la protection : Chrome sur Android l'accorde en général sans question. */
(async () => {
  try {
    if (matchMedia("(display-mode: standalone)").matches && navigator.storage?.persisted && !(await navigator.storage.persisted()))
      await demanderProtection();
  } catch { /* sans effet */ }
  afficherEtat();
})();

/* une autre fenêtre de Muninn passe à une nouvelle version de la base : celle-ci doit être rechargée (audit F4) */
db.quandBloque(b => {
  const el = $("#maj");
  el.querySelector("span")!.textContent = b === "recharger"
    ? "Muninn a été mis à jour dans une autre fenêtre : rechargez celle-ci pour continuer."
    : "Une autre fenêtre de Muninn, plus ancienne, est ouverte : fermez-la (ou rechargez-la) pour finir la mise à jour.";
  const btn = $<HTMLButtonElement>("#majbtn");
  btn.textContent = "Recharger"; btn.disabled = false;
  btn.onclick = () => location.reload();
  el.hidden = false;
});

surveillerCopies();
brancherPartage();
alerteCode.brancher();
demarrer().then(() => synchro.brancher()).catch(() => {
  $("#list").innerHTML = `<div class="note">Vos données n'ont pas pu être chargées. Fermez l'appli et rouvrez-la.</div>`;
});
