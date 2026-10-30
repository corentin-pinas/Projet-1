/* « Ma journée » : écran d'accueil, à droite de la liste quand aucun patient n'est ouvert.
   Les patients du jour en petites fiches, rangées en matin et après-midi : nom, séance ou bilan, région du bilan,
   ce qui est prévu (« À venir » de la séance d'avant) et le résumé court de la séance d'avant.
   Aucune demande à l'IA ici : tout vient de ce qui est déjà enregistré. */
import type { Donnees } from "./db";
import { brefDe, decalerJours, demiDe, frDate, isoDay, journee, jourLabel, prochaineJournee, type Carte } from "./regles";
import { esc } from "./ui";

let decalage = 0;   // 0 : aujourd'hui, 1 : demain

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

/* contenu de l'écran ; surPatient est appelé quand on touche une petite fiche */
export function afficher(el: HTMLElement, d: Donnees, surPatient: (id: string) => void) {
  const now = new Date(), auj = isoDay(now);
  if (!d.dossiers.length) { el.innerHTML = `<div class="empty">Ajoutez vos premiers bilans avec le bouton « Ajouter des bilans ».</div>`; return; }
  const jour = decalerJours(auj, decalage);
  const cartes = journee(d.dossiers, d.bilans, d.seances, jour);
  const notees = cartes.filter(c => c.faite).length, bilans = cartes.filter(c => c.rdv.t === "bilan").length;

  let html = `<div class="head"><div><h2>Ma journée</h2><div class="meta">${esc(jourLong(jour).replace(/^./, x => x.toUpperCase()))}${cartes.length ? " · " + pluriel(cartes.length, "patient") + (bilans ? ` (dont ${pluriel(bilans, "bilan")})` : "") : ""}${cartes.length && decalage === 0 ? " · " + notees + (notees > 1 ? " séances notées" : " séance notée") : ""}</div></div>
    <div class="bils jchoix" role="group" aria-label="Jour affiché"><button data-dec="0" aria-pressed="${decalage === 0}">Aujourd'hui</button><button data-dec="1" aria-pressed="${decalage === 1}">Demain</button></div></div>`;
  if (cartes.length) {
    /* matin, après-midi, puis les rendez-vous sans demi-journée (anciens rendez-vous sans heure) */
    const groupes: [string, Carte[]][] = [["Matin", cartes.filter(c => demiDe(c.rdv) === "am")], ["Après-midi", cartes.filter(c => demiDe(c.rdv) === "pm")], ["Sans précision", cartes.filter(c => !demiDe(c.rdv))]];
    html += groupes.filter(([, l]) => l.length).map(([titre, l]) => `<h3 class="jdemi">${titre} <small>${pluriel(l.length, "patient")}</small></h3><div class="jcartes">${l.map(carte).join("")}</div>`).join("");
  }
  else {
    const proch = prochaineJournee(d.dossiers, decalerJours(jour, 1));
    const demain = decalage === 0 && proch === decalerJours(auj, 1);
    html += `<div class="empty jvide">Aucun rendez-vous noté ${decalage === 0 ? "aujourd'hui" : "demain"}.${proch ? `<br>Prochains rendez-vous : ${esc(jourLabel(proch, now).toLowerCase())}.` : ""}${demain ? `<div class="row"><button class="primary" id="jproch">Voir demain</button></div>` : ""}</div>`;
  }
  html += `<p class="note jnote">Touchez une fiche pour ouvrir le dossier du patient. Les rendez-vous se notent sur la fiche ou dans l'agenda.</p>`;
  el.innerHTML = html;

  el.querySelectorAll<HTMLElement>("[data-patient]").forEach(b => b.onclick = () => surPatient(b.dataset.patient!));
  el.querySelectorAll<HTMLElement>("[data-dec]").forEach(b => b.onclick = () => { decalage = +b.dataset.dec!; afficher(el, d, surPatient); });
  const p = el.querySelector<HTMLElement>("#jproch");
  if (p) p.onclick = () => { decalage = 1; afficher(el, d, surPatient); };
}

/* au retour sur l'appli un autre jour, on revient sur « aujourd'hui » */
export const revenirAujourdhui = () => { decalage = 0; };
