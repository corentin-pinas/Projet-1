import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { verifications, type EtatAppareil } from "./verifications";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

let horsConnexionPret = !!navigator.serviceWorker?.controller;

registerSW({
  immediate: true,
  onOfflineReady() { horsConnexionPret = true; afficher(); },
  onRegistered(reg) { if (reg?.active) { horsConnexionPret = true; afficher(); } }
});

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
  return { installee, horsConnexionPret, stockageProtege, espaceLibre };
}

async function afficher() {
  const etat = await lireEtat();
  $("#checks").innerHTML = verifications(etat).map(v => `
    <li class="check${v.ok ? " ok" : ""}" data-id="${v.id}">
      <span class="pastille" aria-hidden="true">${v.ok ? "✓" : "!"}</span>
      <div><b>${esc(v.titre)}</b><span>${esc(v.detail)}</span></div>
    </li>`).join("");
  $("#persist").hidden = etat.stockageProtege !== false;
}

$("#version").textContent = __VERSION__;
$("#persist").addEventListener("click", async () => {
  try { await navigator.storage.persist(); } catch { /* refus du navigateur : l'écran le dira */ }
  afficher();
});
$("#refresh").addEventListener("click", afficher);
matchMedia("(display-mode: standalone)").addEventListener("change", afficher);

/* Une appli installée demande d'emblée la protection : sur Android, elle est en général accordée sans question. */
(async () => {
  try {
    if (matchMedia("(display-mode: standalone)").matches && navigator.storage?.persisted && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch { /* sans effet */ }
  afficher();
})();
