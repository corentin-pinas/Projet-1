/* « Ma journée » : écran d'accueil, à droite de la liste quand aucun patient n'est ouvert.
   Les patients du jour en petites fiches, rangées en matin et après-midi : nom, séance ou bilan, région du bilan,
   ce qui est prévu (« À venir » de la séance d'avant) et le résumé court de la séance d'avant.
   Aucune demande à l'IA ici : tout vient de ce qui est déjà enregistré. */
import type { Donnees } from "./db";
import { brefDe, decalerJours, demiDe, frDate, isoDay, journee, jourLabel, prochaineJournee, type Carte } from "./regles";
import { esc } from "./ui";

/* ce qui est affiché : une demi-journée d'aujourd'hui, ou toute la journée de demain ; null = choisi par l'appli */
type Vue = "am" | "pm" | "demain";
let choix: Vue | null = null;

const jourLong = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
const pluriel = (n: number, mot: string) => n + " " + mot + (n > 1 ? "s" : "");

function carte(c: Carte): string {
  const r = c.bilan?.resume, bilan = c.rdv.t === "bilan";
  const quoi = bilan ? (c.bilan ? "Bilan" : "Premier bilan") : "Séance";
  let corps = "";
  if (c.faite) {
    corps = `<p class="jfait"><span class="l"><span class="ok" aria-hidden="true">✓</span> Séance notée${c.faite.contenu ? " : " + esc(brefDe(c.faite)) : ""}</span></p>`;
  } else {
    if (c.avenir) corps += `<p class="jprevu"><span class="l"><b>Prévu :</b> ${esc(c.avenir.texte)}</span></p>`;
    if (c.avant) corps += `<p class="javant"><span class="l"><b>Séance du ${esc(frDate(c.avant.date).slice(0, 5))} :</b> ${esc(brefDe(c.avant))}</span></p>`;
    else if (r?.coup_oeil) corps += `<p class="javant"><span class="l"><b>Bilan :</b> ${esc(r.coup_oeil)}</span></p>`;
    else if (!c.bilan) corps += `<p class="javant">Bilan à venir.</p>`;
  }
  return `<button class="jcarte${c.faite ? " faite" : ""}" data-patient="${esc(c.dossier.id)}">
    <span class="jtete"><span class="jnom">${esc(c.dossier.label)}</span><span class="jtype${bilan ? " bilan" : ""}">${quoi}</span></span>
    ${r?.region ? `<span class="jregion">${esc(r.region)}</span>` : ""}
    ${corps}</button>`;
}

/* Par défaut : la demi-journée en cours (avant 13 h, le matin) ; le matin sans patient, on montre directement l'après-midi. */
export function vueParDefaut(maintenant: Date, cartes: Carte[]): Vue {
  if (maintenant.getHours() >= 13) return "pm";
  return !cartes.some(c => demiDe(c.rdv) === "am") && cartes.some(c => demiDe(c.rdv) === "pm") ? "pm" : "am";
}

/* contenu de l'écran ; surPatient est appelé quand on touche une petite fiche */
export function afficher(el: HTMLElement, d: Donnees, surPatient: (id: string) => void) {
  const now = new Date(), auj = isoDay(now), demain = decalerJours(auj, 1);
  if (!d.dossiers.length) { el.innerHTML = `<div class="empty">Ajoutez vos premiers bilans avec le bouton « Ajouter des bilans ».</div>`; return; }
  const cartesAuj = journee(d.dossiers, d.bilans, d.seances, auj), cartesDemain = journee(d.dossiers, d.bilans, d.seances, demain);
  const vue = choix ?? vueParDefaut(now, cartesAuj);
  /* les rendez-vous sans demi-journée (anciens, sans heure) restent visibles avec le matin */
  const dans = (m: "am" | "pm") => cartesAuj.filter(c => (demiDe(c.rdv) ?? "am") === m);
  const cartes = vue === "demain" ? cartesDemain : dans(vue);
  const jour = vue === "demain" ? demain : auj;
  const notees = cartes.filter(c => c.faite).length, bilans = cartes.filter(c => c.rdv.t === "bilan").length;
  const quand = vue === "am" ? "matin" : vue === "pm" ? "après-midi" : "";

  let html = `<div class="head"><div><h2>Ma journée</h2><div class="meta">${esc(jourLong(jour).replace(/^./, x => x.toUpperCase()))}${quand ? " · " + quand : ""}${cartes.length ? " · " + pluriel(cartes.length, "patient") + (bilans ? ` (dont ${pluriel(bilans, "bilan")})` : "") : ""}${cartes.length && vue !== "demain" ? " · " + notees + (notees > 1 ? " séances notées" : " séance notée") : ""}</div></div>
    <div class="bils jchoix" role="group" aria-label="Moment affiché">${([["am", "Matin", dans("am").length], ["pm", "Après-midi", dans("pm").length], ["demain", "Demain", cartesDemain.length]] as const)
      .map(([v, t, n]) => `<button data-vue="${v}" aria-pressed="${vue === v}">${t} <small>${n}</small></button>`).join("")}</div></div>`;
  if (cartes.length) {
    if (vue === "demain") {
      const groupes: [string, Carte[]][] = [["Matin", cartes.filter(c => (demiDe(c.rdv) ?? "am") === "am")], ["Après-midi", cartes.filter(c => demiDe(c.rdv) === "pm")]];
      html += groupes.filter(([, l]) => l.length).map(([titre, l]) => `<h3 class="jdemi">${titre} <small>${pluriel(l.length, "patient")}</small></h3><div class="jcartes">${l.map(carte).join("")}</div>`).join("");
    } else html += `<div class="jcartes">${cartes.map(carte).join("")}</div>`;
  } else {
    const autre = vue === "am" && dans("pm").length ? "pm" : vue !== "demain" && cartesDemain.length ? "demain" : null;
    const proch = prochaineJournee(d.dossiers, decalerJours(jour, 1));
    html += `<div class="empty jvide">Aucun rendez-vous noté ${vue === "am" ? "ce matin" : vue === "pm" ? "cet après-midi" : "demain"}.${!autre && proch ? `<br>Prochains rendez-vous : ${esc(jourLabel(proch, now).toLowerCase())}.` : ""}${autre ? `<div class="row"><button class="primary" data-vue="${autre}">${autre === "pm" ? "Voir l'après-midi" : "Voir demain"}</button></div>` : ""}</div>`;
  }
  html += `<p class="note jnote">Touchez une fiche pour ouvrir le dossier du patient. Tous les patients : bouton « Liste des patients ».</p>`;
  el.innerHTML = html;

  el.querySelectorAll<HTMLElement>("[data-patient]").forEach(b => b.onclick = () => surPatient(b.dataset.patient!));
  el.querySelectorAll<HTMLElement>("[data-vue]").forEach(b => b.onclick = () => { choix = b.dataset.vue as Vue; afficher(el, d, surPatient); });
}

/* au retour sur l'appli un autre jour ou l'après-midi venu, l'appli choisit de nouveau la demi-journée */
export const revenirAujourdhui = () => { choix = null; };
