/* Décorations de saison, pour que l'appli ne soit pas « que du boulot » (idée de Corentin, 29 octobre 2026).
   Dans les coins et sur les bords, transparentes, jamais sur le texte ; seuls l'araignée et le lapin se touchent.
   Immobiles si la tablette réduit les animations. Le petit kiné porte un chapeau de saison (styles.css). */

export type Saison = "halloween" | "noel" | "paques" | "anniversaire" | null;

/* Dimanche de Pâques (calendrier grégorien, méthode de Meeus) */
export function paques(annee: number): Date {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour, 12);
}

const memeJour = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const ecart = (a: Date, b: Date) => Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate(), 12).getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate(), 12).getTime()) / 864e5);

/* Périodes choisies par Corentin :
   Halloween : la semaine d'avant jusqu'au 1er novembre ; Noël : tout le mois, du 1er au 26 décembre ;
   Pâques : du dimanche des Rameaux au lundi de Pâques ; anniversaire de Corentin (13 mars) : du 10 au 16 mars, prioritaire. */
export function saisonDu(d: Date): Saison {
  const m = d.getMonth() + 1, j = d.getDate();
  if (m === 3 && j >= 10 && j <= 16) return "anniversaire";
  if ((m === 10 && j >= 24) || (m === 11 && j === 1)) return "halloween";
  if (m === 12 && j <= 26) return "noel";
  const e = ecart(d, paques(d.getFullYear()));
  if (e >= -7 && e <= 1) return "paques";
  return null;
}

/* Noël monte en puissance au fil du mois : 1 (début décembre) … 5 (du 24 au 26). */
export function niveauNoel(d: Date): number {
  if (saisonDu(d) !== "noel") return 0;
  const j = d.getDate();
  return j >= 24 ? 5 : j >= 20 ? 4 : j >= 15 ? 3 : j >= 8 ? 2 : 1;
}

export const jourAnniversaire = (d: Date) => memeJour(d, new Date(d.getFullYear(), 2, 13, 12));

const TOILE = `<svg viewBox="0 0 120 120" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
  <path d="M0 0L120 120M0 0L120 60M0 0L60 120M0 0L120 15M0 0L15 120"/>
  <path d="M28 0Q24 12 28 28Q12 24 0 28"/><path d="M58 0Q50 26 58 58Q26 50 0 58"/><path d="M90 0Q78 40 90 90Q40 78 0 90"/>
  <path d="M28 7Q34 20 28 28M58 14Q68 40 58 58M90 22Q104 60 90 90"/><path d="M7 28Q20 34 28 28M14 58Q40 68 58 58M22 90Q60 104 90 90"/></g></svg>`;
const ARAIGNEE = `<svg viewBox="0 0 40 60" aria-hidden="true"><line x1="20" y1="0" x2="20" y2="34" stroke="currentColor" stroke-width="1"/>
  <g fill="currentColor"><ellipse cx="20" cy="42" rx="7" ry="8"/><circle cx="20" cy="33" r="4.5"/></g>
  <g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M14 38L5 32M14 42L4 42M14 46L5 52M15 49L8 58M26 38L35 32M26 42L36 42M26 46L35 52M25 49L32 58"/></g></svg>`;
const CHAUVE_SOURIS = `<svg viewBox="0 0 64 30" aria-hidden="true"><path fill="currentColor" d="M32 10c2-4 4-5 4-5l1 5c5-4 13-5 17-2-5 1-8 4-8 8-3-3-7-3-9 1-2-2-4-3-5-3s-3 1-5 3c-2-4-6-4-9-1 0-4-3-7-8-8 4-3 12-2 17 2l1-5s2 1 4 5z"/></svg>`;
const FLOCON = `<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 3v34M5 11.5l30 17M5 28.5l30-17"/><path d="M20 9l-4-4M20 9l4-4M20 31l-4 4M20 31l4 4"/></g></svg>`;

const OEUF = (c1: string, c2: string) => `<svg viewBox="0 0 30 38" aria-hidden="true"><ellipse cx="15" cy="21" rx="13" ry="16" fill="${c1}"/><path d="M3 18q6-5 12 0t12 0M3.5 26q6-5 11.5 0t11.5 0" fill="none" stroke="${c2}" stroke-width="2.6"/></svg>`;
const LAPIN = `<svg viewBox="0 0 60 56" aria-hidden="true"><g fill="#F4EEE8" stroke="#8A7F77" stroke-width="1.5"><ellipse cx="21" cy="16" rx="6" ry="16"/><ellipse cx="39" cy="16" rx="6" ry="16"/><ellipse cx="30" cy="42" rx="19" ry="16"/></g>
  <ellipse cx="21" cy="16" rx="2.6" ry="11" fill="#F6B7C3"/><ellipse cx="39" cy="16" rx="2.6" ry="11" fill="#F6B7C3"/><circle cx="23" cy="40" r="2.2" fill="#2A2522"/><circle cx="37" cy="40" r="2.2" fill="#2A2522"/><ellipse cx="30" cy="45" rx="2.4" ry="1.8" fill="#E88A9B"/></svg>`;
const BALLON = (c: string) => `<svg viewBox="0 0 30 70" aria-hidden="true"><path d="M15 40q-3 8 2 15t-2 15" fill="none" stroke="currentColor" stroke-width="1"/><ellipse cx="15" cy="19" rx="13" ry="17" fill="${c}"/><path d="M12 36l3 4 3-4z" fill="${c}"/><ellipse cx="10" cy="12" rx="3" ry="5" fill="#FFFFFF" opacity=".35"/></svg>`;
const ETOILE = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" fill="#F7C948" stroke="#C9971C" stroke-width="1.5"/></svg>`;
const SAPIN = `<svg viewBox="0 0 60 76" aria-hidden="true"><rect x="26" y="62" width="8" height="12" fill="#7A4E2D"/><path d="M30 4l18 22h-8l14 18h-9l13 18H6l13-18h-9l14-18h-8z" fill="#2E7D4F"/>
  <g><circle cx="24" cy="30" r="2.5" fill="#E53935"/><circle cx="36" cy="40" r="2.5" fill="#F7C948"/><circle cx="20" cy="50" r="2.5" fill="#42A5F5"/><circle cx="40" cy="55" r="2.5" fill="#E53935"/><circle cx="30" cy="20" r="2" fill="#F7C948"/></g></svg>`;
const CADEAU = (c: string) => `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="14" width="32" height="24" rx="2" fill="${c}"/><rect x="2" y="10" width="36" height="7" rx="2" fill="${c}"/><rect x="17" y="10" width="6" height="28" fill="#F7C948"/><path d="M20 10c-4-8-12-6-8 0M20 10c4-8 12-6 8 0" fill="none" stroke="#F7C948" stroke-width="2.5"/></svg>`;
const COULEURS = ["#E53935", "#F7C948", "#43A047", "#42A5F5", "#AB47BC", "#FF7043"];

/* éléments répartis régulièrement, avec des tailles et des départs décalés */
const pluie = (n: number, classe: string, contenu: (i: number) => string) => Array.from({ length: n }, (_, i) =>
  `<div class="${classe}" style="left:${(i * 37 + 5) % 97}%;--t:${0.7 + ((i * 7) % 5) / 10};--d:${-((i * 2.3) % 14)}s;--v:${11 + (i % 4) * 2}s">${contenu(i)}</div>`).join("");

function contenu(saison: Exclude<Saison, null>, niveau: number, maintenant: Date): string {
  if (saison === "halloween")
    return `<div class="toile g">${TOILE}</div><div class="toile d">${TOILE}</div><div class="araignee" title="Touchez-moi !"><div class="corps">${ARAIGNEE}</div></div><div class="chauve"><div class="ailes">${CHAUVE_SOURIS}</div></div>`;
  if (saison === "noel") {
    /* plus on approche de Noël, plus il y en a : flocons, guirlande, neige au sol, sapin et cadeaux, étoile */
    const flocons = [0, 4, 7, 11, 15, 22][niveau];
    const ampoules = Array.from({ length: 24 }, (_, i) => `<circle cx="${i * 50 + 25}" cy="${14 + (i % 2) * 8}" r="6" fill="${COULEURS[i % 4]}" style="animation-delay:${(i % 3) * 0.6}s"/>`).join("");
    return pluie(flocons, "flocon", () => FLOCON) +
      (niveau >= 2 ? `<div class="guirlande"><svg viewBox="0 0 1200 34" preserveAspectRatio="none" aria-hidden="true"><path d="M0 8${Array.from({ length: 24 }, (_, i) => `Q${i * 50 + 25} ${26} ${i * 50 + 50} 8`).join("")}" fill="none" stroke="#3B5D3A" stroke-width="2"/>${ampoules}</svg></div>` : "") +
      (niveau >= 4 ? `<div class="sol" style="--h:${niveau === 5 ? 22 : 12}px"></div><div class="sapin">${SAPIN}</div><div class="cadeau c1">${CADEAU("#E53935")}</div>` : "") +
      (niveau >= 5 ? `<div class="cadeau c2">${CADEAU("#42A5F5")}</div><div class="etoile">${ETOILE}</div>` : "");
  }
  if (saison === "paques")
    return `<div class="oeufs g">${OEUF("#F6B7C3", "#FFFFFF")}${OEUF("#A5D6A7", "#F7C948")}${OEUF("#90CAF9", "#FFFFFF")}</div>` +
      `<div class="oeufs d">${OEUF("#FFE082", "#AB47BC")}${OEUF("#CE93D8", "#FFFFFF")}</div><div class="lapin" title="Touchez-moi !">${LAPIN}</div>`;
  /* anniversaire : confettis, ballons qui montent, et un petit mot le 13 mars */
  return pluie(14, "confetti", i => `<i style="background:${COULEURS[i % COULEURS.length]}"></i>`) +
    `<div class="ballon b1">${BALLON("#E53935")}</div><div class="ballon b2">${BALLON("#F7C948")}</div><div class="ballon b3">${BALLON("#42A5F5")}</div>` +
    (jourAnniversaire(maintenant) ? `<div class="bravo">Joyeux anniversaire Corentin ! 🎉</div>` : "");
}

export function decorer(saison: Saison, active: boolean, maintenant = new Date()) {
  const niveau = saison === "noel" ? niveauNoel(maintenant) : 0;
  const cle = active && saison ? `${saison} n${niveau}${jourAnniversaire(maintenant) ? " jour" : ""}` : "";
  const deja = document.querySelector<HTMLElement>(".saison");
  if (deja && cle && deja.dataset.cle === cle) return;   // déjà en place : l'araignée ne redescend pas à chaque réglage
  deja?.remove();
  const h = document.documentElement;
  h.dataset.saison = cle ? saison! : "";
  h.dataset.noel = cle && niveau ? String(niveau) : "";
  if (!cle) return;
  const d = document.createElement("div");
  d.className = "saison " + saison;
  d.dataset.cle = cle;
  d.setAttribute("aria-hidden", "true");
  d.innerHTML = contenu(saison!, niveau, maintenant);
  document.body.append(d);
  /* ce qu'on peut toucher : l'araignée remonte le long de son fil, le lapin saute */
  for (const sel of [".araignee", ".lapin"]) {
    const el = d.querySelector<HTMLElement>(sel);
    const anime = el?.querySelector<HTMLElement>(".corps") ?? el;
    if (!el || !anime) continue;
    el.onclick = () => {
      if (anime.classList.contains("bouge")) return;
      anime.classList.add("bouge");
      anime.addEventListener("animationend", () => anime.classList.remove("bouge"), { once: true });
    };
  }
}
