/* Réglages d'affichage : fond, couleur, contraste, taille du texte, écriture, décorations de saison.
   Gardés dans la tablette (préférence de l'appareil) et appliqués dès l'ouverture, avant le premier affichage. */
import { decorer, saisonDu } from "./saisons";

export type Reglages = {
  fond: "auto" | "clair" | "sombre";
  couleur: "vert" | "violet" | "orange" | "bleu";
  contraste: boolean;
  taille: "normal" | "grand" | "tres-grand";
  police: "atkinson" | "nunito" | "comfortaa";
  saisons: boolean;
};

export const DEFAUT: Reglages = { fond: "auto", couleur: "vert", contraste: false, taille: "normal", police: "atkinson", saisons: true };
const CLE = "reglages-affichage";

export function lire(): Reglages {
  try { return { ...DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || "{}") }; } catch { return { ...DEFAUT }; }
}

export function appliquer(r: Reglages, maintenant = new Date()) {
  const h = document.documentElement;
  if (r.fond === "auto") delete h.dataset.theme; else h.dataset.theme = r.fond === "sombre" ? "dark" : "light";
  h.dataset.palette = r.couleur;
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
  { cle: "couleur", titre: "Couleur principale", options: [["vert", "Vert"], ["violet", "Violet"], ["orange", "Orange"], ["bleu", "Bleu"]] },
  { cle: "taille", titre: "Taille du texte", options: [["normal", "Normale"], ["grand", "Grande"], ["tres-grand", "Très grande"]] },
  { cle: "police", titre: "Écriture", options: [["atkinson", "Très lisible"], ["nunito", "Arrondie"], ["comfortaa", "Fantaisie"]] },
  { cle: "contraste", titre: "Contraste", options: [[false, "Normal"], [true, "Fort"]] },
  { cle: "saisons", titre: "Décorations de saison", options: [[true, "Oui"], [false, "Non"]] }
] as Choix<keyof Reglages>[];

export function brancher() {
  const dlg = document.querySelector<HTMLDialogElement>("#regdlg")!;
  const zone = dlg.querySelector<HTMLElement>("#regchoix")!;
  const afficher = () => {
    const r = lire();
    zone.innerHTML = CHOIX.map(c => `<fieldset class="regligne"><legend>${c.titre}</legend><div class="pastilles">${c.options.map(([v, l]) =>
      `<button type="button" data-cle="${c.cle}" data-val='${JSON.stringify(v)}' aria-pressed="${r[c.cle] === v}"${c.cle === "couleur" ? ` class="teinte" data-teinte="${v}"` : c.cle === "police" ? ` data-police="${v}"` : ""}>${l}</button>`).join("")}</div></fieldset>`).join("") +
      `<p class="note">${saisonDu(new Date()) ? "Une décoration de saison est en cours." : "Prochaines décorations : Halloween (la semaine d'avant) et Noël (en décembre)."} Ces réglages restent dans cette tablette.</p>`;
    zone.querySelectorAll<HTMLButtonElement>("[data-cle]").forEach(b => b.onclick = () => {
      enregistrer({ ...lire(), [b.dataset.cle!]: JSON.parse(b.dataset.val!) });
      afficher();
    });
  };
  document.querySelector<HTMLElement>("#regbtn")!.onclick = () => { afficher(); dlg.showModal(); };
  dlg.querySelector<HTMLElement>("#regfermer")!.onclick = () => dlg.close();
  dlg.querySelector<HTMLElement>("#regdefaut")!.onclick = () => { enregistrer({ ...DEFAUT }); afficher(); };
}
