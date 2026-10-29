/* Réglages d'affichage : fond, couleur, contraste, taille du texte, écriture, décorations de saison.
   Gardés dans la tablette (préférence de l'appareil) et appliqués dès l'ouverture, avant le premier affichage. */
import { cssPalette, PALETTES } from "./palettes";
import { decorer, saisonDu } from "./saisons";

/* écritures proposées, toutes hébergées avec l'appli (fonctionnent sans internet) */
export const POLICES: Record<string, { nom: string; famille: string }> = {
  atkinson: { nom: "Très lisible", famille: '"Atkinson Hyperlegible"' },
  lexend: { nom: "Claire", famille: '"Lexend"' },
  nunito: { nom: "Arrondie", famille: '"Nunito"' },
  quicksand: { nom: "Douce", famille: '"Quicksand"' },
  poppins: { nom: "Moderne", famille: '"Poppins"' },
  baloo: { nom: "Ronde", famille: '"Baloo 2"' },
  comfortaa: { nom: "Fantaisie", famille: '"Comfortaa"' },
  manuscrite: { nom: "Manuscrite", famille: '"Patrick Hand"' }
};

export type Reglages = {
  fond: "auto" | "clair" | "sombre";
  couleur: string;   // clé de PALETTES
  contraste: boolean;
  taille: "normal" | "grand" | "tres-grand";
  police: string;    // clé de POLICES
  saisons: boolean;
};

export const DEFAUT: Reglages = { fond: "auto", couleur: "vert", contraste: false, taille: "normal", police: "atkinson", saisons: true };
const CLE = "reglages-affichage";

export function lire(): Reglages {
  let r: Reglages;
  try { r = { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || "{}") }; } catch { r = { ...DEFAUT }; }
  if (!PALETTES[r.couleur]) r.couleur = DEFAUT.couleur;
  if (!POLICES[r.police]) r.police = DEFAUT.police;
  return r;
}

export function appliquer(r: Reglages, maintenant = new Date()) {
  const h = document.documentElement;
  if (r.fond === "auto") delete h.dataset.theme; else h.dataset.theme = r.fond === "sombre" ? "dark" : "light";
  h.dataset.palette = r.couleur;
  /* couleurs de la palette : une feuille de style ajoutée après celle de l'appli, qu'elle remplace */
  let st = document.getElementById("style-palette");
  if (!st) { st = document.createElement("style"); st.id = "style-palette"; document.head.append(st); }
  st.textContent = cssPalette(PALETTES[r.couleur] ?? PALETTES.vert) + `\nbody{font-family:${(POLICES[r.police] ?? POLICES.atkinson).famille},system-ui,sans-serif}`;
  h.dataset.contraste = r.contraste ? "fort" : "";
  h.dataset.taille = r.taille;
  h.dataset.police = r.police;
  /* la barre du navigateur suit la couleur principale */
  const accent = getComputedStyle(h).getPropertyValue("--accent").trim();
  if (accent) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", accent);
  if (document.body) decorer(saisonDu(maintenant), r.saisons);
}

export function enregistrer(r: Reglages) {
  try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* sans stockage : réglage valable jusqu'à la fermeture */ }
  appliquer(r);
}

/* ---------- écran Réglages ---------- */

type Choix<K extends keyof Reglages> = { cle: K; titre: string; options: [Reglages[K], string][] };
const CHOIX: Choix<keyof Reglages>[] = [
  { cle: "fond", titre: "Fond", options: [["auto", "Comme la tablette"], ["clair", "Clair"], ["sombre", "Sombre"]] },
  { cle: "couleur", titre: "Couleur principale", options: Object.entries(PALETTES).map(([k, p]) => [k, p.nom]) },
  { cle: "taille", titre: "Taille du texte", options: [["normal", "Normale"], ["grand", "Grande"], ["tres-grand", "Très grande"]] },
  { cle: "police", titre: "Écriture", options: Object.entries(POLICES).map(([k, p]) => [k, p.nom]) },
  { cle: "contraste", titre: "Contraste", options: [[false, "Normal"], [true, "Fort"]] },
  { cle: "saisons", titre: "Décorations de saison", options: [[true, "Oui"], [false, "Non"]] }
] as Choix<keyof Reglages>[];

export function brancher() {
  const dlg = document.querySelector<HTMLDialogElement>("#regdlg")!;
  const zone = dlg.querySelector<HTMLElement>("#regchoix")!;
  const afficher = () => {
    const r = lire();
    zone.innerHTML = CHOIX.map(c => `<fieldset class="regligne"><legend>${c.titre}</legend><div class="pastilles">${c.options.map(([v, l]) =>
      `<button type="button" data-cle="${c.cle}" data-val='${JSON.stringify(v)}' aria-pressed="${r[c.cle] === v}"${c.cle === "couleur" ? ` class="teinte" style="--t:${PALETTES[v as string].clair.accent};--t2:${PALETTES[v as string].sombre.accent}"` : c.cle === "police" ? ` style="font-family:${POLICES[v as string].famille}"` : ""}>${l}</button>`).join("")}</div></fieldset>`).join("") +
      `<p class="note">${saisonDu(new Date()) ? "Une décoration de saison est en cours." : "Décorations de l'année : anniversaire (10 au 16 mars), Pâques, Halloween (la semaine d'avant), Noël (tout décembre, de plus en plus)."} Ces réglages restent dans cette tablette.</p>`;
    zone.querySelectorAll<HTMLButtonElement>("[data-cle]").forEach(b => b.onclick = () => {
      enregistrer({ ...lire(), [b.dataset.cle!]: JSON.parse(b.dataset.val!) });
      afficher();
    });
  };
  document.querySelector<HTMLElement>("#regbtn")!.onclick = () => { afficher(); dlg.showModal(); };
  dlg.querySelector<HTMLElement>("#regfermer")!.onclick = () => dlg.close();
  dlg.querySelector<HTMLElement>("#regdefaut")!.onclick = () => { enregistrer({ ...DEFAUT }); afficher(); };
}
