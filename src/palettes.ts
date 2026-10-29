/* Palettes de couleurs de l'écran Réglages. Chacune donne sa couleur principale en fond clair et en fond sombre
   (avec un fond sombre assorti : « noir et violet », « noir et rouge »…). Lisibilité vérifiée par un test (contraste AA). */

export type Palette = {
  nom: string;
  clair: { accent: string; accentBg: string };
  sombre: { accent: string; accentInk: string; accentBg: string; bg: string; panel: string; line: string; soft: string };
  warn?: { clair: string; clairBg: string; sombre: string; sombreBg: string };   // quand la couleur principale ressemble à l'orange d'alerte
};

export const PALETTES: Record<string, Palette> = {
  /* couleurs de Muninn : bleu nuit en clair, nuit et lune dorée en sombre (palette d'origine depuis la 0.9.4) */
  muninn: { nom: "Muninn", clair: { accent: "#3F3A6E", accentBg: "#ECEAF5" },
    sombre: { accent: "#F2C96B", accentInk: "#1A1508", accentBg: "#2E2A47", bg: "#110F1A", panel: "#1B1828", line: "#322D47", soft: "#ABA5C2" },
    warn: { clair: "#A3283A", clairBg: "#FBE4E7", sombre: "#F07A84", sombreBg: "#3A1C20" } },
  vert: { nom: "Vert", clair: { accent: "#23705F", accentBg: "#E3F1EC" },
    sombre: { accent: "#5BB79F", accentInk: "#0E1716", accentBg: "#1F332D", bg: "#141B1C", panel: "#1E2729", line: "#33413F", soft: "#9AAAA8" } },
  turquoise: { nom: "Turquoise", clair: { accent: "#0E6E75", accentBg: "#DDF2F3" },
    sombre: { accent: "#4FC6CC", accentInk: "#04191A", accentBg: "#133436", bg: "#0D1617", panel: "#152224", line: "#27403F", soft: "#93AEB0" } },
  bleu: { nom: "Bleu", clair: { accent: "#1F5FA8", accentBg: "#E3EEFA" },
    sombre: { accent: "#6EA8F0", accentInk: "#0B1522", accentBg: "#1C2A3D", bg: "#0F141B", panel: "#18202B", line: "#2C3A4C", soft: "#9AA8B8" } },
  indigo: { nom: "Indigo", clair: { accent: "#3949A3", accentBg: "#E6E9F8" },
    sombre: { accent: "#8C9EFF", accentInk: "#0D1230", accentBg: "#1F2547", bg: "#0F111C", panel: "#181B2B", line: "#2D3350", soft: "#A0A6C2" } },
  violet: { nom: "Violet", clair: { accent: "#6B3FA0", accentBg: "#EFE7F8" },
    sombre: { accent: "#B48CF0", accentInk: "#170D22", accentBg: "#2B2140", bg: "#120E17", panel: "#1C1624", line: "#352A43", soft: "#A79BB5" } },
  rose: { nom: "Framboise", clair: { accent: "#A82A62", accentBg: "#FBE5EF" },
    sombre: { accent: "#F28AB8", accentInk: "#26091A", accentBg: "#3D1A2B", bg: "#170E13", panel: "#24161D", line: "#432A37", soft: "#B9A1AD" } },
  rouge: { nom: "Rouge", clair: { accent: "#B3261E", accentBg: "#FBE6E4" },
    sombre: { accent: "#F2837A", accentInk: "#240806", accentBg: "#3D1A18", bg: "#170E0E", panel: "#231616", line: "#43292A", soft: "#B9A2A1" } },
  orange: { nom: "Orange", clair: { accent: "#A84B12", accentBg: "#FBE8DA" },
    sombre: { accent: "#F59A4A", accentInk: "#1A0F06", accentBg: "#3A2416", bg: "#14100D", panel: "#201913", line: "#3D2F24", soft: "#B3A193" },
    warn: { clair: "#A3283A", clairBg: "#FBE4E7", sombre: "#F07A84", sombreBg: "#3A1C20" } },
  or: { nom: "Or", clair: { accent: "#7E5A00", accentBg: "#F8EDCF" },
    sombre: { accent: "#F5C542", accentInk: "#1F1600", accentBg: "#3A2E0E", bg: "#14120B", panel: "#201C11", line: "#3E3620", soft: "#B5AC92" },
    warn: { clair: "#A3283A", clairBg: "#FBE4E7", sombre: "#F07A84", sombreBg: "#3A1C20" } },
  cafe: { nom: "Café", clair: { accent: "#7A4E2D", accentBg: "#F3E9E1" },
    sombre: { accent: "#D9A47A", accentInk: "#1E1208", accentBg: "#3A281A", bg: "#15110E", panel: "#211A15", line: "#3F3229", soft: "#B3A598" } },
  ardoise: { nom: "Ardoise", clair: { accent: "#46535E", accentBg: "#E7EBEE" },
    sombre: { accent: "#A9B7C4", accentInk: "#111820", accentBg: "#27303A", bg: "#121518", panel: "#1C2126", line: "#343C45", soft: "#A0A8B0" } }
};

/* ---------- calculs de couleur ---------- */

const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map(x => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
export const melange = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v * t + y[i] * (1 - t))); };
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contraste = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/* Règles CSS d'une palette : fond clair (fond et traits légèrement teintés), fond sombre, et le mode « comme la tablette ». */
export function cssPalette(p: Palette): string {
  const c = p.clair, s = p.sombre;
  const clair = `--accent:${c.accent};--accent-ink:#FFFFFF;--accent-bg:${c.accentBg};--bg:${melange(c.accent, "#EEF1F0", 0.06)};--line:${melange(c.accent, "#CCD5D3", 0.1)};` +
    (p.warn ? `--warn:${p.warn.clair};--warn-bg:${p.warn.clairBg};` : "");
  const sombre = `--accent:${s.accent};--accent-ink:${s.accentInk};--accent-bg:${s.accentBg};--bg:${s.bg};--panel:${s.panel};--line:${s.line};--soft:${s.soft};` +
    (p.warn ? `--warn:${p.warn.sombre};--warn-bg:${p.warn.sombreBg};` : "");
  return `:root{${clair}}\n:root[data-theme="dark"]{${sombre}}\n@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${sombre}}}`;
}
