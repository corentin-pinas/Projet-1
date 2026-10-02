import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { demarrer, rafraichirIA } from "./app";
import * as db from "./db";
import { coutDollars, testerCle } from "./ia";
import { toast, esc } from "./ui";
import { verifications, type EtatAppareil } from "./verifications";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

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
  let cleIA = false;
  try { cleIA = !!(await db.lireParametre<string>("cle_ia")); } catch { /* base indisponible */ }
  return { installee, horsConnexionPret, stockageProtege, espaceLibre, protectionRefusee, brave, cleIA };
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
  await afficherIA(etat.cleIA);
  const reste = v.filter(x => !x.ok).length;
  $("#etatbtn").classList.toggle("alerte", reste > 0);
  $("#etattxt").textContent = reste ? `État de l'appli : ${reste} point${reste > 1 ? "s" : ""} à voir` : "État de l'appli";
  return v;
}

const dollars = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

async function afficherIA(cle: boolean) {
  $("#iaform").hidden = cle;
  $("#iadel").hidden = !cle;
  if (!cle) { $("#iaetat").textContent = "Aucune clé enregistrée. La clé se crée sur console.anthropic.com, rubrique « API Keys »."; return; }
  const c = await db.consoDuMois();
  $("#iaetat").textContent = c.bilans || c.seances
    ? `Clé enregistrée. Ce mois-ci : ${c.bilans} bilan${c.bilans > 1 ? "s" : ""} résumé${c.bilans > 1 ? "s" : ""} et ${c.seances} séance${c.seances > 1 ? "s" : ""} traitée${c.seances > 1 ? "s" : ""}, environ ${dollars(coutDollars(c))}.`
    : "Clé enregistrée. Rien de consommé ce mois-ci.";
}

$("#iasave").addEventListener("click", async () => {
  const cle = $<HTMLInputElement>("#iacle").value.trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(cle)) { toast("Cette clé ne ressemble pas à une clé Anthropic : elle commence par sk-ant-."); return; }
  const btn = $<HTMLButtonElement>("#iasave"); btn.disabled = true; btn.textContent = "Vérification…";
  const erreur = await testerCle(cle);
  btn.disabled = false; btn.textContent = "Enregistrer la clé";
  if (erreur) { toast(erreur); return; }
  await db.ecrireParametre("cle_ia", cle);
  $<HTMLInputElement>("#iacle").value = "";
  toast("Clé vérifiée et enregistrée. Les bilans en attente vont être résumés.");
  await afficherEtat();
  rafraichirIA();
});
$("#iadel").addEventListener("click", async () => {
  await db.ecrireParametre("cle_ia", undefined);
  toast("Clé retirée de cette tablette.");
  await afficherEtat();
  rafraichirIA();
});

async function demanderProtection() {
  let ok = false;
  try { ok = await navigator.storage.persist(); } catch { /* traité comme un refus */ }
  protectionRefusee = !ok;
  return ok;
}

$("#version").textContent = __VERSION__;
$("#etatbtn").addEventListener("click", () => { afficherEtat(); $<HTMLDialogElement>("#etatdlg").showModal(); });
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

demarrer().catch(() => {
  $("#list").innerHTML = `<div class="note">Vos données n'ont pas pu être chargées. Fermez l'appli et rouvrez-la.</div>`;
});
