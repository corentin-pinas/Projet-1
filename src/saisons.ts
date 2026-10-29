/* Décorations de saison, pour que l'appli ne soit pas « que du boulot » (idée de Corentin, 29 octobre 2026).
   Discrètes : dans les coins (toiles, araignée qu'on peut toucher et chauve-souris de passage à Halloween, flocons à Noël)
   et un emoji à côté du titre, transparentes, jamais sur le texte, aucun clic intercepté, immobiles si la tablette réduit les animations. */

export type Saison = "halloween" | "noel" | null;

/* Halloween : la semaine d'avant jusqu'au 1er novembre. Noël : du 1er au 26 décembre. */
export function saisonDu(d: Date): Saison {
  const m = d.getMonth() + 1, j = d.getDate();
  if ((m === 10 && j >= 24) || (m === 11 && j === 1)) return "halloween";
  if (m === 12 && j <= 26) return "noel";
  return null;
}

const TOILE = `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
  <path d="M0 0L120 120M0 0L120 60M0 0L60 120M0 0L120 15M0 0L15 120"/>
  <path d="M28 0Q24 12 28 28Q12 24 0 28"/><path d="M58 0Q50 26 58 58Q26 50 0 58"/><path d="M90 0Q78 40 90 90Q40 78 0 90"/>
  <path d="M28 7Q34 20 28 28M58 14Q68 40 58 58M90 22Q104 60 90 90"/><path d="M7 28Q20 34 28 28M14 58Q40 68 58 58M22 90Q60 104 90 90"/></g></svg>`;
const ARAIGNEE = `<svg viewBox="0 0 40 60" aria-hidden="true"><line x1="20" y1="0" x2="20" y2="34" stroke="currentColor" stroke-width="1"/>
  <g fill="currentColor"><ellipse cx="20" cy="42" rx="7" ry="8"/><circle cx="20" cy="33" r="4.5"/></g>
  <g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M14 38L5 32M14 42L4 42M14 46L5 52M15 49L8 58M26 38L35 32M26 42L36 42M26 46L35 52M25 49L32 58"/></g></svg>`;
const CHAUVE_SOURIS = `<svg viewBox="0 0 64 30" aria-hidden="true"><path fill="currentColor" d="M32 10c2-4 4-5 4-5l1 5c5-4 13-5 17-2-5 1-8 4-8 8-3-3-7-3-9 1-2-2-4-3-5-3s-3 1-5 3c-2-4-6-4-9-1 0-4-3-7-8-8 4-3 12-2 17 2l1-5s2 1 4 5z"/></svg>`;
const FLOCON = `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 3v34M5 11.5l30 17M5 28.5l30-17"/><path d="M20 9l-4-4M20 9l4-4M20 31l-4 4M20 31l4 4"/></g></svg>`;

export function decorer(saison: Saison, active: boolean) {
  const deja = document.querySelector(".saison");
  if (deja && active && saison && deja.classList.contains(saison)) return;   // déjà en place : l'araignée ne redescend pas à chaque réglage
  deja?.remove();
  document.documentElement.dataset.saison = active && saison ? saison : "";
  if (!active || !saison) return;
  const d = document.createElement("div");
  d.className = "saison " + saison;
  d.setAttribute("aria-hidden", "true");
  d.innerHTML = saison === "halloween"
    ? `<div class="toile g">${TOILE}</div><div class="toile d">${TOILE}</div><div class="araignee" title="Touchez-moi !"><div class="corps">${ARAIGNEE}</div></div><div class="chauve"><div class="ailes">${CHAUVE_SOURIS}</div></div>`
    : Array.from({ length: 7 }, (_, i) => `<div class="flocon f${i}">${FLOCON}</div>`).join("");
  document.body.append(d);
  /* l'araignée remonte le long de son fil quand on la touche, puis redescend */
  const a = d.querySelector<HTMLElement>(".araignee .corps");
  if (a) d.querySelector<HTMLElement>(".araignee")!.onclick = () => {
    if (a.classList.contains("monte")) return;
    a.classList.add("monte");
    a.addEventListener("animationend", () => a.classList.remove("monte"), { once: true });
  };
}
