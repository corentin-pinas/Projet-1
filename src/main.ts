import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { verifications, type EtatAppareil } from "./verifications";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let horsConnexionPret = !!navigator.serviceWorker?.controller;
let protectionRefusee = false;
let brave = false;

registerSW({
  immediate: true,
  onOfflineReady() { horsConnexionPret = true; afficher(); },
  onRegistered(reg) { if (reg?.active) { horsConnexionPret = true; afficher(); } }
});

/* Brave se signale par navigator.brave ; son message de refus n'est pas le même que celui des autres navigateurs. */
(navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave?.isBrave()
  .then(b => { brave = b; afficher(); })
  .catch(() => {});

function toast(texte: string) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const d = document.createElement("div");
  d.className = "toast";
  d.setAttribute("role", "status");
  d.textContent = texte;
  document.body.append(d);
  setTimeout(() => d.remove(), 3500);
}

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
  return { installee, horsConnexionPret, stockageProtege, espaceLibre, protectionRefusee, brave };
}

async function afficher() {
  const etat = await lireEtat();
  $("#checks").innerHTML = verifications(etat).map(v => `
    <li class="check${v.ok ? " ok" : ""}" data-id="${v.id}">
      <span class="pastille" aria-hidden="true">${v.ok ? "✓" : "!"}</span>
      <div><b>${esc(v.titre)}</b><span>${esc(v.detail)}</span></div>
    </li>`).join("");
  $("#persist").hidden = etat.stockageProtege !== false || protectionRefusee;
  return etat;
}

async function demanderProtection() {
  let ok = false;
  try { ok = await navigator.storage.persist(); } catch { /* traité comme un refus */ }
  protectionRefusee = !ok;
  return ok;
}

$("#version").textContent = __VERSION__;
$("#persist").addEventListener("click", async () => {
  const ok = await demanderProtection();
  await afficher();
  toast(ok ? "Données protégées." : "Le navigateur a refusé. L'explication est dans l'encadré orange.");
});
$("#refresh").addEventListener("click", async () => {
  const etat = await afficher();
  const reste = verifications(etat).filter(v => !v.ok).length;
  toast(reste ? `Vérifié : ${reste} point${reste > 1 ? "s" : ""} encore en orange.` : "Vérifié : tout est au vert.");
});
matchMedia("(display-mode: standalone)").addEventListener("change", afficher);

/* Une appli installée demande d'emblée la protection : Chrome sur Android l'accorde en général sans question. */
(async () => {
  try {
    if (matchMedia("(display-mode: standalone)").matches && navigator.storage?.persisted && !(await navigator.storage.persisted()))
      await demanderProtection();
  } catch { /* sans effet */ }
  afficher();
})();
