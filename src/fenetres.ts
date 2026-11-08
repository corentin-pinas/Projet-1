/* Fermer une fenêtre en touchant à côté (choix de Corentin du 4 novembre 2026, fait en 1.5.3) : Réglages, État de l'appli,
   placer un patient, horaires, confirmations… se ferment comme avec leur bouton « Fermer » ou « Annuler », sans remonter
   la page. Si quelque chose a été tapé ou coché dans la fenêtre, Muninn demande avant de fermer. Les champs de recherche
   et ceux marqués data-libre ne comptent pas comme une saisie. */
import { confirmer } from "./ui";

const BOUTON_FERMER = /^(fermer|annuler|non)$/i;

function bouton(d: HTMLDialogElement): HTMLElement | null {
  return d.querySelector<HTMLElement>("#etatclose, #regfermer, #pannuler, #hannuler")
    ?? [...d.querySelectorAll<HTMLElement>("button")].find(b => BOUTON_FERMER.test((b.textContent ?? "").trim())) ?? null;
}

async function fermer(d: HTMLDialogElement) {
  if (d.dataset.modifie && !d.classList.contains("confirm")
    && !await confirmer("Fermer sans enregistrer ? Ce que vous venez de saisir dans cette fenêtre sera perdu.", "Fermer sans enregistrer")) return;
  const x = window.scrollX, y = window.scrollY;
  if (d.classList.contains("confirm")) d.close("non");
  else { const b = bouton(d); if (b) b.click(); else d.close(); }
  if (d.open) d.close();
  window.scrollTo(x, y);   // la page reste où elle était
}

export function brancher() {
  /* une saisie dans une fenêtre ouverte */
  const noter = (e: Event) => {
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
    if ((t instanceof HTMLInputElement && t.type === "search") || t.closest("[data-libre]")) return;
    const d = t.closest("dialog");
    if (d) d.dataset.modifie = "1";
  };
  document.addEventListener("input", noter, true);
  document.addEventListener("change", noter, true);
  /* chaque ouverture repart sans saisie */
  new MutationObserver(l => { for (const m of l) { const d = m.target as HTMLDialogElement; if (d.open) delete d.dataset.modifie; } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
  /* un toucher hors du cadre de la fenêtre : le clic arrive sur la fenêtre elle-même (son fond), en dehors de son rectangle */
  document.addEventListener("click", e => {
    const d = e.target;
    if (!(d instanceof HTMLDialogElement) || !d.open) return;
    const r = d.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return;
    if (e.clientX === 0 && e.clientY === 0) return;   // clic venu du clavier
    fermer(d);
  });
}
