/* « Ma journée » : écran d'accueil, à droite de la liste quand aucun patient n'est ouvert.
   Les patients du jour en petites fiches, dans l'ordre des rendez-vous : heure, nom, séance ou bilan, région du bilan,
   ce qui est prévu (« À venir » de la séance d'avant) et le résumé court de la séance d'avant.
   Aucune demande à l'IA ici : tout vient de ce qui est déjà enregistré. */
import type { Donnees } from "./db";
import { brefDe, decalerJours, frDate, heureFr, isoDay, journee, jourLabel, minutes, prochaineJournee, type Carte } from "./regles";
import { esc } from "./ui";

let decalage = 0;   // 0 : aujourd'hui, 1 : demain

const jourLong = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
const pluriel = (n: number, mot: string) => n + " " + mot + (n > 1 ? "s" : "");

function carte(c: Carte, suivant: boolean): string {
  const r = c.bilan?.resume, bilan = c.rdv.t === "bilan";
  const quoi = bilan ? (c.bilan ? "Bilan" : "Premier bilan") : "Séance";
  let corps = "";
  if (c.faite) {
    corps = `<p class="jfait"><span aria-hidden="true">✓</span> Séance notée${c.faite.contenu ? " : " + esc(brefDe(c.faite)) : ""}</p>`;
  } else {
    if (c.avenir) corps += `<p class="jprevu"><b>Prévu :</b> ${esc(c.avenir.texte)}</p>`;
    if (c.avant) corps += `<p class="javant"><b>Séance du ${esc(frDate(c.avant.date).slice(0, 5))} :</b> ${esc(brefDe(c.avant))}</p>`;
    else if (r?.coup_oeil) corps += `<p class="javant"><b>Bilan :</b> ${esc(r.coup_oeil)}</p>`;
    else if (!c.bilan) corps += `<p class="javant">Bilan à venir.</p>`;
  }
  return `<button class="jcarte${c.faite ? " faite" : ""}${suivant ? " suivant" : ""}" data-patient="${esc(c.dossier.id)}">
    <span class="jtete"><span class="jheure">${c.rdv.h ? esc(heureFr(c.rdv.h)) : "—"}</span><span class="jnom">${esc(c.dossier.label)}</span><span class="jtype${bilan ? " bilan" : ""}">${quoi}</span></span>
    ${suivant ? `<span class="jsuivant">À suivre</span>` : ""}
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
  /* aujourd'hui, la prochaine fiche pas encore notée dont l'heure n'est pas passée de plus de 10 minutes */
  const mtn = now.getHours() * 60 + now.getMinutes();
  const suivant = decalage === 0 ? cartes.find(c => !c.faite && c.rdv.h && minutes(c.rdv.h) >= mtn - 10) : undefined;

  let html = `<div class="head"><div><h2>Ma journée</h2><div class="meta">${esc(jourLong(jour).replace(/^./, x => x.toUpperCase()))}${cartes.length ? " · " + pluriel(cartes.length, "patient") + (bilans ? ` (dont ${pluriel(bilans, "bilan")})` : "") : ""}${cartes.length && decalage === 0 ? " · " + notees + (notees > 1 ? " séances notées" : " séance notée") : ""}</div></div>
    <div class="bils jchoix" role="group" aria-label="Jour affiché"><button data-dec="0" aria-pressed="${decalage === 0}">Aujourd'hui</button><button data-dec="1" aria-pressed="${decalage === 1}">Demain</button></div></div>`;
  if (cartes.length) html += `<div class="jcartes">${cartes.map(c => carte(c, c === suivant)).join("")}</div>`;
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
