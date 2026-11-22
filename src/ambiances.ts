/* Ambiances (2.0.0, choix de Corentin du 20 au 22 novembre 2026) : la nouvelle direction artistique, plus adulte,
   sombre et lumineuse. Une ambiance remplace le fond et la couleur principale : couleurs, fond dessiné, dégradé des
   boutons principaux, écriture des titres. « Classique » garde l'apparence d'avant (fond et couleur au choix).
   Lisibilité vérifiée par ambiances.test.ts (contraste AA, texte courant AAA). */

export type Ambiance = {
  nom: string;
  bg: string; panel: string; line: string; ink: string; soft: string;
  accent: string; accent2: string; accentInk: string; accentBg: string;
  warn: string; warnBg: string;
  degrade: string;        // boutons principaux, bouton choisi, titre de Ma journée
  fond: string;           // fond de l'écran (dégradés, lumières)
  titre?: string;         // écriture des titres (sinon Lexend)
  pastille: string;       // aperçu dans les Réglages
};

const halo = (c1: string, c2: string, base: string) =>
  `radial-gradient(700px 480px at 92% 0%,${c1},transparent 70%),radial-gradient(800px 520px at 0% 100%,${c2},transparent 70%),${base}`;

export const AMBIANCES: Record<string, Ambiance> = {
  couchant: { nom: "Néon couchant", bg: "#060407", panel: "#1A0D15", line: "#4A2236", ink: "#FFF4EC", soft: "#CFA9A6",
    accent: "#FF4F9A", accent2: "#FFB23E", accentInk: "#1A0610", accentBg: "#3A1428", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#FF4F9A,#FF8A3D 60%,#FFC93E)", fond: halo("rgba(255,79,154,.26)", "rgba(255,140,40,.18)", "#060407"),
    pastille: "linear-gradient(135deg,#FF4F9A,#FFB23E)" },
  odin: { nom: "Or d'Odin", bg: "#0B0805", panel: "#221810", line: "#4A3818", ink: "#F6EAD0", soft: "#C2AB84",
    accent: "#E2B45C", accent2: "#FFD98A", accentInk: "#1A1206", accentBg: "#3A2A12", warn: "#F07A84", warnBg: "#3A1C20",
    degrade: "linear-gradient(180deg,#FFE3A0,#E2B45C 50%,#B07A2C)",
    fond: "radial-gradient(900px 520px at 50% -8%,rgba(255,206,120,.30),transparent 65%),radial-gradient(500px 400px at 100% 100%,rgba(180,120,40,.16),transparent 70%),repeating-conic-gradient(from 0deg at 50% -8%,rgba(255,210,130,.045) 0 3deg,transparent 3deg 9deg),#0B0805",
    titre: '"Cinzel",serif', pastille: "linear-gradient(180deg,#FFE3A0,#B07A2C)" },
  cafe: { nom: "Café", bg: "#110E0C", panel: "#231C17", line: "#3F3229", ink: "#F4ECE4", soft: "#B7A596",
    accent: "#E7A565", accent2: "#F3C48D", accentInk: "#1B120B", accentBg: "#3A281A", warn: "#F07A84", warnBg: "#3A1C20",
    degrade: "linear-gradient(120deg,#E7A565,#F3C48D)", fond: "radial-gradient(900px 600px at 85% -10%,rgba(231,165,101,.13),transparent 60%),#110E0C",
    pastille: "#E7A565" },
  holo: { nom: "Hologramme", bg: "#03080E", panel: "#0A1C28", line: "#1E4A5C", ink: "#E6FBFF", soft: "#8FB7C4",
    accent: "#3FDCFF", accent2: "#9FF0FF", accentInk: "#02141C", accentBg: "#0E3242", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#3FDCFF,#9FF0FF)",
    fond: "linear-gradient(rgba(63,220,255,.05) 1px,transparent 1px) 0 0/40px 40px,linear-gradient(90deg,rgba(63,220,255,.05) 1px,transparent 1px) 0 0/40px 40px,#03080E",
    pastille: "#3FDCFF" },
  aurore: { nom: "Aurore", bg: "#0B0820", panel: "#1C1640", line: "#3C3170", ink: "#F3F0FF", soft: "#B3A8DC",
    accent: "#B49BFF", accent2: "#E6A8FF", accentInk: "#160C33", accentBg: "#2C2260", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#A98BFF,#E6A8FF)", fond: halo("rgba(230,168,255,.28)", "rgba(120,90,255,.30)", "linear-gradient(160deg,#0B0820,#1A1040)"),
    pastille: "#A98BFF" },
  amethyste: { nom: "Améthyste", bg: "#0C0614", panel: "#1E0F2C", line: "#45245E", ink: "#F7EEFE", soft: "#C3A6D6",
    accent: "#D27BFF", accent2: "#F2B6FF", accentInk: "#1D0730", accentBg: "#35184A", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#D27BFF,#F2B6FF)", fond: halo("rgba(210,80,255,.25)", "rgba(140,60,255,.22)", "#0C0614"),
    pastille: "#D27BFF" },
  nebuleuse: { nom: "Nébuleuse", bg: "#070818", panel: "#16163A", line: "#33366E", ink: "#EEF0FF", soft: "#A9ADDB",
    accent: "#8FA0FF", accent2: "#5EE6FF", accentInk: "#070818", accentBg: "#24245A", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#7C8CFF,#5EE6FF)", fond: halo("rgba(94,230,255,.20)", "rgba(150,90,255,.32)", "linear-gradient(150deg,#070818,#140F3A)"),
    pastille: "linear-gradient(135deg,#7C8CFF,#5EE6FF)" },
  abysses: { nom: "Abysses", bg: "#04101C", panel: "#0C2236", line: "#1F4566", ink: "#EAF6FF", soft: "#94B8CF",
    accent: "#4FB3FF", accent2: "#A8E1FF", accentInk: "#03121F", accentBg: "#133552", warn: "#FFB547", warnBg: "#3A2A12",
    degrade: "linear-gradient(120deg,#4FB3FF,#A8E1FF)", fond: "radial-gradient(800px 600px at 60% 40%,rgba(80,170,255,.18),transparent 70%),linear-gradient(180deg,#04101C,#0A2238)",
    pastille: "#4FB3FF" },
};

/* « classique » : l'apparence d'avant (fond et couleur principale au choix) */
export const CLASSIQUE = "classique";

/* Règles CSS d'une ambiance, posées après celles de la palette (même force, donc elles l'emportent). */
export function cssAmbiance(cle: string, a: Ambiance): string {
  return `:root[data-ambiance="${cle}"]{--bg:${a.bg};--panel:${a.panel};--line:${a.line};--ink:${a.ink};--soft:${a.soft};` +
    `--accent:${a.accent};--accent2:${a.accent2};--accent-ink:${a.accentInk};--accent-bg:${a.accentBg};--warn:${a.warn};--warn-bg:${a.warnBg};` +
    `--degrade:${a.degrade};--fond:${a.fond};--titre:${a.titre ?? '"Lexend",sans-serif'};color-scheme:dark}`;
}
