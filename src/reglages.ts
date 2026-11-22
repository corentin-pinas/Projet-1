/* Réglages d'affichage : fond, couleur, contraste, taille du texte, écriture, décorations de saison.
   Gardés dans la tablette (préférence de l'appareil) et appliqués dès l'ouverture, avant le premier affichage. */
import { AMBIANCES, CLASSIQUE, cssAmbiance } from "./ambiances";
import { cssPalette, PALETTES } from "./palettes";
import { decorer, saisonDu } from "./saisons";
import { rattrapage, retours } from "./carte";
import { rattrapage as rattrapageSuivi } from "./releves-ecran";

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
  ambiance: string;  // clé de AMBIANCES, ou « classique » (fond et couleur ci-dessous) — 2.0.0
  fond: "auto" | "clair" | "sombre";
  couleur: string;   // clé de PALETTES
  contraste: boolean;
  taille: "normal" | "grand" | "tres-grand";
  police: string;    // clé de POLICES
  saisons: boolean;
  pleinEcran: boolean;   // barre du haut de la tablette masquée (1.5.3)
};

export const DEFAUT: Reglages = { ambiance: "couchant", fond: "auto", couleur: "muninn", contraste: false, taille: "normal", police: "atkinson", saisons: true, pleinEcran: false };
const CLE = "reglages-affichage";

export function lire(): Reglages {
  let r: Reglages;
  try { r = { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || "{}") }; } catch { r = { ...DEFAUT }; }
  if (!PALETTES[r.couleur]) r.couleur = DEFAUT.couleur;
  if (r.ambiance !== CLASSIQUE && !AMBIANCES[r.ambiance]) r.ambiance = DEFAUT.ambiance;
  if (!POLICES[r.police]) r.police = DEFAUT.police;
  return r;
}

export function appliquer(r: Reglages, maintenant = new Date()) {
  const h = document.documentElement;
  const amb = AMBIANCES[r.ambiance];
  /* une ambiance est toujours sombre ; « Classique » garde le fond choisi */
  if (amb) h.dataset.theme = "dark"; else if (r.fond === "auto") delete h.dataset.theme; else h.dataset.theme = r.fond === "sombre" ? "dark" : "light";
  if (amb) h.dataset.ambiance = r.ambiance; else delete h.dataset.ambiance;
  h.dataset.palette = r.couleur;
  /* couleurs de la palette : une feuille de style ajoutée après celle de l'appli, qu'elle remplace */
  let st = document.getElementById("style-palette");
  if (!st) { st = document.createElement("style"); st.id = "style-palette"; document.head.append(st); }
  st.textContent = cssPalette(PALETTES[r.couleur] ?? PALETTES.muninn) + (amb ? "\n" + cssAmbiance(r.ambiance, amb) : "") + `\nbody{font-family:${(POLICES[r.police] ?? POLICES.atkinson).famille},system-ui,sans-serif}`;
  h.dataset.contraste = r.contraste ? "fort" : "";
  h.dataset.taille = r.taille;
  h.dataset.police = r.police;
  barres();
  if (document.body) decorer(saisonDu(maintenant), r.saisons);
}

/* La barre du haut d'Android (heure, batterie) prend la couleur du fond de l'appli, en clair comme en sombre. */
function barres() {
  const fond = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (fond) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", fond);
}
/* « comme la tablette » : la tablette peut passer seule du clair au sombre */
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", barres);

export function enregistrer(r: Reglages) {
  try { localStorage.setItem(CLE, JSON.stringify(r)); } catch { /* sans stockage : réglage valable jusqu'à la fermeture */ }
  appliquer(r);
  pleinEcran(r.pleinEcran);
}

/* Barre du haut de la tablette (heure, batterie) : Muninn lui donne sa couleur de fond, mais certaines tablettes Samsung
   la dessinent elles-mêmes, en clair (constaté le 8 novembre 2026). Réglage « Masquée » : plein écran, demandé au premier
   toucher de chaque ouverture (Chrome l'exige) ; un glissement depuis le haut fait réapparaître la barre un instant. */
function pleinEcran(oui: boolean) {
  try {
    if (oui && document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else if (!oui && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch { /* navigateur sans plein écran */ }
}
if (typeof document !== "undefined") document.addEventListener("pointerdown", () => { if (lire().pleinEcran) pleinEcran(true); }, true);

/* ---------- écran Réglages ---------- */

type Choix<K extends keyof Reglages> = { cle: K; titre: string; options: [Reglages[K], string][] };
const CHOIX: Choix<keyof Reglages>[] = [
  { cle: "ambiance", titre: "Ambiance", options: [...Object.entries(AMBIANCES).map(([k, a]) => [k, a.nom]), [CLASSIQUE, "Classique (fond et couleur au choix)"]] },
  { cle: "fond", titre: "Fond", options: [["auto", "Comme la tablette"], ["clair", "Clair"], ["sombre", "Sombre"]] },
  { cle: "couleur", titre: "Couleur principale", options: Object.entries(PALETTES).map(([k, p]) => [k, p.nom]) },
  { cle: "taille", titre: "Taille du texte", options: [["normal", "Normale"], ["grand", "Grande"], ["tres-grand", "Très grande"]] },
  { cle: "police", titre: "Écriture", options: Object.entries(POLICES).map(([k, p]) => [k, p.nom]) },
  { cle: "contraste", titre: "Contraste", options: [[false, "Normal"], [true, "Fort"]] },
  { cle: "saisons", titre: "Décorations de saison", options: [[true, "Oui"], [false, "Non"]] },
  { cle: "pleinEcran", titre: "Barre du haut de la tablette (heure, batterie)", options: [[false, "Visible"], [true, "Masquée"]] }
] as Choix<keyof Reglages>[];

export function brancher() {
  const dlg = document.querySelector<HTMLDialogElement>("#regdlg")!;
  const zone = dlg.querySelector<HTMLElement>("#regchoix")!;
  const afficher = () => {
    const r = lire();
    zone.innerHTML = CHOIX.map(c => `<fieldset class="regligne"><legend>${c.titre}</legend><div class="pastilles">${c.options.map(([v, l]) =>
      `<button type="button" data-cle="${c.cle}" data-val='${JSON.stringify(v)}' aria-pressed="${r[c.cle] === v && !((c.cle === "fond" || c.cle === "couleur") && r.ambiance !== CLASSIQUE)}"${c.cle === "ambiance" && AMBIANCES[v as string] ? ` class="teinte amb" style="--t:${AMBIANCES[v as string].pastille};--t2:${AMBIANCES[v as string].pastille}"` : c.cle === "couleur" ? ` class="teinte" style="--t:${PALETTES[v as string].clair.accent};--t2:${PALETTES[v as string].sombre.accent}"` : c.cle === "police" ? ` style="font-family:${POLICES[v as string].famille}"` : ""}>${l}</button>`).join("")}</div></fieldset>`).join("") +
      `<p class="note">${saisonDu(new Date()) ? "Une décoration de saison est en cours." : "Décorations de l'année : anniversaire (10 au 16 mars), Pâques, Halloween (la semaine d'avant), Noël (tout décembre, de plus en plus)."} Ces réglages restent dans cette tablette.</p>`;
    /* retours sur les dessins de la carte du corps (2.1.0), à transmettre pour corriger les planches */
    retours().then(h => { if (h) zone.insertAdjacentHTML("beforeend", h); }).catch(() => {});
    rattrapage(zone).catch(() => {});
    rattrapageSuivi(zone).catch(() => {});
    zone.querySelectorAll<HTMLButtonElement>("[data-cle]").forEach(b => b.onclick = () => {
      const cle = b.dataset.cle!;
      /* fond et couleur principale ne valent que pour l'ambiance « Classique » : les choisir y revient */
      enregistrer({ ...lire(), [cle]: JSON.parse(b.dataset.val!), ...(cle === "fond" || cle === "couleur" ? { ambiance: CLASSIQUE } : {}) });
      afficher();
    });
  };
  document.querySelector<HTMLElement>("#regbtn")!.onclick = () => { afficher(); dlg.showModal(); };

  dlg.querySelector<HTMLElement>("#regfermer")!.onclick = () => dlg.close();
  dlg.querySelector<HTMLElement>("#regdefaut")!.onclick = () => { enregistrer({ ...DEFAUT }); afficher(); };
}
