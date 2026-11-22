/* « Ma journée » : écran d'accueil, à droite de la liste quand aucun patient n'est ouvert.
   Les patients du jour en petites fiches, rangées en matin et après-midi : nom, séance ou bilan, région du bilan,
   ce qui est prévu (« À venir » de la séance d'avant) et le résumé court de la séance d'avant.
   Aucune demande à l'IA ici : tout vient de ce qui est déjà enregistré. */
import * as db from "./db";
import type { Donnees } from "./db";
import { brefDe, decalerJours, objectifsDe, rdvApres, suiviDe, jourCourt, demiDe, frDate, isoDay, journee, jourLabel, jourLong, pluriel, prochaineJournee, sansBilan, sansRendezVous, souventAbsents, texteAbsences, type Carte, type SansBilan, type SansRdv } from "./regles";
import { courbe, esc, toast } from "./ui";

/* ce qui est affiché : une demi-journée d'aujourd'hui, ou toute la journée de demain ; null = choisi par l'appli */
type Vue = "am" | "pm" | "demain";
let choix: Vue | null = null;


/* nombre écrit sans zéro inutile (« 4,5 », « 120 ») */
const fr = (n: number) => String(n).replace(".", ",");

function carte(c: Carte, d: Donnees): string {
  const r = c.bilan?.resume, bilan = c.rdv.t === "bilan";
  const quoi = bilan ? (c.bilan ? "Bilan" : "Premier bilan") : "Séance";
  let corps = "";
  if (c.faite) {
    corps = `<p class="jfait"><span class="l"><span class="ok" aria-hidden="true">✓</span> Séance notée${c.faite.contenu ? " : " + esc(brefDe(c.faite)) : ""}</span></p>`;
  } else {
    /* 2.0.0 : objectif en cours, prévu, nombre de séances, prochain rendez-vous, douleur et une mesure (plus de « Séance du … ») */
    const obj = objectifsDe(c.dossier, d.bilans)?.liste[0];
    if (obj) corps += `<p class="jobj"><span class="e">🎯 Objectif</span><span class="l">${esc(obj)}</span></p>`;
    if (c.avenir) corps += `<p class="jprevu"><span class="l"><b>Prévu :</b> ${esc(c.avenir.texte)}</span></p>`;
    else if (!c.avant && r?.coup_oeil) corps += `<p class="javant"><span class="l"><b>Bilan :</b> ${esc(r.coup_oeil)}</span></p>`;
    else if (!c.bilan) corps += `<p class="javant">Bilan à venir.</p>`;
  }
  const nb = d.seances.filter(s => s.dossierId === c.dossier.id).length, apres = rdvApres(c.dossier, c.rdv.d);
  if (nb || apres) corps += `<span class="jpuces">${nb ? `<span>${pluriel(nb, "séance")}</span>` : ""}${apres ? `<span>Prochain : ${esc(jourCourt(apres.d))}</span>` : ""}</span>`;
  const su = suiviDe(c.dossier.id, d.bilans, d.seances), dl = su.douleur.at(-1), me = su.mesure?.points.at(-1);
  if (dl || me) corps += `<span class="jmes">${dl ? `<span><span class="e">Douleur</span><span class="g">${fr(dl.v)}<small>/10</small></span></span>${courbe(su.douleur, { tend: su.tendance ? 1 : undefined })}` : ""}${me ? `<span class="v"><span class="e">${esc(su.mesure!.label)}</span><span class="g">${fr(me.v)}<small>${su.mesure!.unite === "°" ? "°" : "&nbsp;" + esc(su.mesure!.unite)}</small></span></span>` : ""}</span>`;
  return `<button class="jcarte${c.faite ? " faite" : ""}" data-patient="${esc(c.dossier.id)}">
    <span class="jtete"><span class="jnom">${esc(c.dossier.label)}</span><span class="jtype${bilan ? " bilan" : ""}">${quoi}</span></span>
    ${r?.region ? `<span class="jregion">${esc(r.region)}</span>` : ""}
    ${corps}</button>`;
}

/* Alerte « sans rendez-vous » (choix de Corentin du 8 novembre 2026) : 30 jours sans rien, oubli de reprendre
   rendez-vous ou fin de traitement ? À 3 mois, proposition d'archiver. Cinq patients montrés, les autres sur demande. */
let tousSansRdv = false;
function blocSansRdv(l: SansRdv[]): string {
  if (!l.length) return "";
  const vus = tousSansRdv ? l : l.slice(0, 5);
  return `<section class="sansrdv" aria-label="Patients sans rendez-vous"><h3>À vérifier : ${l.length === 1 ? "un patient" : l.length + " patients"} sans rendez-vous</h3>
    ${vus.map(x => `<div class="lsr" data-sr="${esc(x.dossier.id)}" data-depuis="${esc(x.depuis)}">
      <b>${esc(x.dossier.label)}</b> : ${x.archiver
        ? `rien depuis le ${esc(frDate(x.depuis))} (plus de 3 mois). Archiver son dossier ?`
        : `pas de rendez-vous depuis le ${esc(frDate(x.depuis))} (${x.jours} jours). Oubli de reprendre rendez-vous, ou fin de traitement ?`}
      <div class="row"><button class="primary" data-srfin>${x.archiver ? "Archiver" : "Fin de traitement"}</button><button data-srrdv>Ajouter un rendez-vous</button><button data-srcalme>${x.archiver ? "Garder" : "C'est normal"}</button></div></div>`).join("")}
    ${l.length > vus.length ? `<button class="lien" data-srtous>Voir les ${l.length - vus.length} autres</button>` : ""}</section>`;
}

/* Bilans manquants (choix de Corentin du 20 novembre 2026) : 7 jours après la création du dossier, ou dès la 2e séance.
   Une petite pastille en haut à droite de Ma journée (« ⚠ 2 bilans manquants ») ; la toucher ouvre la liste dans une
   fenêtre : « Ajouter le bilan » (choix du fichier, qui rejoint le dossier), « Plus tard » (7 jours), « Pas de bilan ». */
let listeBilansOuverte = false;   // la fenêtre reste ouverte quand l'écran se redessine après un choix
function fenetreSansBilan(l: SansBilan[]): string {
  return `<dialog class="sbdlg" aria-labelledby="sbtitre"><h3 id="sbtitre">Bilans manquants</h3>
    <p class="note">Dossiers créés sans bilan depuis 7 jours, ou qui ont déjà 2 séances.</p>
    ${l.map(x => `<div class="lsb" data-sb="${esc(x.dossier.id)}">
      <div><b>${esc(x.dossier.label)}</b> <small>créé le ${esc(frDate(x.cree).slice(0, 5))}${x.seances ? ` · ${pluriel(x.seances, "séance")}` : ""}</small></div>
      <div class="row"><button class="primary" data-sbajout>Ajouter le bilan</button><button data-sbtard>Plus tard</button><button data-sbnon>Pas de bilan</button></div></div>`).join("")}
    <div class="row"><button id="sbfermer">Fermer</button></div></dialog>`;
}

/* Patients souvent absents (choix de Corentin du 20 novembre 2026) : 3 absences d'affilée ou 5 en tout. Petite pastille à
   côté de celle des bilans ; la liste en fenêtre : « Voir la fiche », « Vu » (plus signalé avant une nouvelle absence). */
let listeAbsentsOuverte = false;
function fenetreAbsents(l: ReturnType<typeof souventAbsents>): string {
  return `<dialog class="sbdlg absdlg" aria-labelledby="abstitre"><h3 id="abstitre">Patients souvent absents</h3>
    <p class="note">3 séances manquées d'affilée, ou 5 en tout (absences comptées depuis le 20/11/2026).</p>
    ${l.map(x => `<div class="lsb" data-ab="${esc(x.dossier.id)}" data-abn="${x.absences.total}">
      <div><b>${esc(x.dossier.label)}</b> <small>${esc(texteAbsences(x.absences))}</small></div>
      <div class="row"><button class="primary" data-abfiche>Voir la fiche</button><button data-abvu>Vu</button></div></div>`).join("")}
    <div class="row"><button id="abfermer">Fermer</button></div></dialog>`;
}

/* Par défaut : la demi-journée en cours (avant 13 h, le matin) ; le matin sans patient, on montre directement l'après-midi. */
/* Aujourd'hui sans aucun rendez-vous (dimanche, congé) : la prochaine journée qui a des patients (choix de Corentin, 8 nov.). */
/* À partir de 20 h, la journée est finie : la prochaine journée avec patients (choix de Corentin, 10 nov.). */
export const HEURE_SOIR = 20;
export function vueParDefaut(maintenant: Date, cartes: Carte[]): Vue {
  if (!cartes.length || maintenant.getHours() >= HEURE_SOIR) return "demain";
  if (maintenant.getHours() >= 13) return "pm";
  return !cartes.some(c => demiDe(c.rdv) === "am") && cartes.some(c => demiDe(c.rdv) === "pm") ? "pm" : "am";
}

/* contenu de l'écran ; surPatient est appelé quand on touche une petite fiche */
export function afficher(el: HTMLElement, d: Donnees, surPatient: (id: string) => void, surBilan: (id: string) => void = surPatient) {
  const now = new Date(), auj = isoDay(now), demain = decalerJours(auj, 1);
  if (!d.dossiers.length) { el.innerHTML = `<div class="empty">Ajoutez vos premiers bilans avec le bouton « Ajouter des bilans ».</div>`; return; }
  /* « demain » = la prochaine journée qui a des patients (demain, ou lundi un samedi), sinon demain */
  const suite = prochaineJournee(d.dossiers, demain) ?? demain;
  const cartesAuj = journee(d.dossiers, d.bilans, d.seances, auj), cartesDemain = journee(d.dossiers, d.bilans, d.seances, suite);
  const nomSuite = suite === demain ? "Demain" : jourLong(suite).split(" ")[0].replace(/^./, x => x.toUpperCase());
  const vue = choix ?? vueParDefaut(now, cartesAuj);
  const soir = now.getHours() >= HEURE_SOIR;
  const saut = !choix && vue === "demain" && (!cartesAuj.length || soir) && cartesDemain.length > 0;
  /* les rendez-vous sans demi-journée (anciens, sans heure) restent visibles avec le matin */
  const dans = (m: "am" | "pm") => cartesAuj.filter(c => (demiDe(c.rdv) ?? "am") === m);
  const cartes = vue === "demain" ? cartesDemain : dans(vue);
  const jour = vue === "demain" ? suite : auj;
  const notees = cartes.filter(c => c.faite).length, bilans = cartes.filter(c => c.rdv.t === "bilan").length;
  const quand = vue === "am" ? "matin" : vue === "pm" ? "après-midi" : "";

  const sans = sansRendezVous(d.dossiers, d.bilans, d.seances, auj);
  const manquants = sansBilan(d.dossiers, d.bilans, d.seances, auj);
  if (!manquants.length) listeBilansOuverte = false;
  const puce = manquants.length ? `<button class="puce" id="sbpuce" aria-haspopup="dialog">⚠ ${manquants.length === 1 ? "1 bilan manquant" : manquants.length + " bilans manquants"}</button>` : "";
  const absents = souventAbsents(d.dossiers, d.seances);
  if (!absents.length) listeAbsentsOuverte = false;
  const puceAbs = absents.length ? `<button class="puce" id="abpuce" aria-haspopup="dialog">⚠ ${absents.length === 1 ? "1 patient souvent absent" : absents.length + " patients souvent absents"}</button>` : "";
  let html = blocSansRdv(sans) + (manquants.length ? fenetreSansBilan(manquants) : "") + (absents.length ? fenetreAbsents(absents) : "") + `<div class="head"><div><h2 class="jtitre">Ma journée</h2>${saut ? `<div class="jsaut">${cartesAuj.length && soir ? "Journée terminée" : "Pas de rendez-vous aujourd'hui"} : voici ${esc(suite === demain ? "demain" : nomSuite.toLowerCase())}.</div>` : ""}<div class="meta">${esc(jourLong(jour).replace(/^./, x => x.toUpperCase()))}${quand ? " · " + quand : ""}${cartes.length ? " · " + pluriel(cartes.length, "patient") + (bilans ? ` (dont ${pluriel(bilans, "bilan")})` : "") : ""}${cartes.length && vue !== "demain" ? " · " + notees + (notees > 1 ? " séances notées" : " séance notée") : ""}</div></div>
    <div class="jdroite">${puce || puceAbs ? `<div class="puces">${puce}${puceAbs}</div>` : ""}<div class="bils jchoix" role="group" aria-label="Moment affiché">${([["am", "Matin", dans("am").length], ["pm", "Après-midi", dans("pm").length], ["demain", nomSuite, cartesDemain.length]] as const)
      .map(([v, t, n]) => `<button data-vue="${v}" aria-pressed="${vue === v}">${t} <small>${n}</small></button>`).join("")}</div></div></div>`;
  if (cartes.length) {
    if (vue === "demain") {
      const groupes: [string, Carte[]][] = [["Matin", cartes.filter(c => (demiDe(c.rdv) ?? "am") === "am")], ["Après-midi", cartes.filter(c => demiDe(c.rdv) === "pm")]];
      html += groupes.filter(([, l]) => l.length).map(([titre, l]) => `<h3 class="jdemi">${titre} <small>${pluriel(l.length, "patient")}</small></h3><div class="jcartes">${l.map(x => carte(x, d)).join("")}</div>`).join("");
    } else html += `<div class="jcartes">${cartes.map(x => carte(x, d)).join("")}</div>`;
  } else {
    const autre = vue === "am" && dans("pm").length ? "pm" : vue !== "demain" && cartesDemain.length ? "demain" : null;
    const proch = prochaineJournee(d.dossiers, decalerJours(jour, 1));
    html += `<div class="empty jvide">Aucun rendez-vous noté ${vue === "am" ? "ce matin" : vue === "pm" ? "cet après-midi" : suite === demain ? "demain" : esc(jourLong(suite))}.${!autre && proch ? `<br>Prochains rendez-vous : ${esc(jourLabel(proch, now).toLowerCase())}.` : ""}${autre ? `<div class="row"><button class="primary" data-vue="${autre}">${autre === "pm" ? "Voir l'après-midi" : "Voir " + esc(suite === demain ? "demain" : nomSuite.toLowerCase())}</button></div>` : ""}</div>`;
  }
  html += `<p class="note jnote">Touchez une fiche pour ouvrir le dossier du patient. Tous les patients : bouton « Liste des patients ».</p>`;
  el.innerHTML = html;

  el.querySelectorAll<HTMLElement>("[data-patient]").forEach(b => b.onclick = () => surPatient(b.dataset.patient!));
  el.querySelectorAll<HTMLElement>("[data-sr]").forEach(z => {
    const id = z.dataset.sr!, depuis = z.dataset.depuis!;
    const on = (sel: string, f: () => Promise<void> | void) => { const b = z.querySelector<HTMLElement>(sel); if (b) b.onclick = async () => { try { await f(); } catch { toast("L'enregistrement a échoué. Réessayez."); } }; };
    on("[data-srfin]", async () => { await db.finTraitement(id, depuis); toast("Dossier archivé. Il reste retrouvable par la recherche."); });
    on("[data-srrdv]", () => surPatient(id));
    on("[data-srcalme]", async () => { await db.modifierDossier(id, x => ({ ...x, calme: auj })); toast("Noté : Muninn vous le redemandera dans 30 jours."); });
  });
  const tous = el.querySelector<HTMLElement>("[data-srtous]");
  if (tous) tous.onclick = () => { tousSansRdv = true; afficher(el, d, surPatient, surBilan); };
  const dlg = el.querySelector<HTMLDialogElement>(".sbdlg");
  const pastille = el.querySelector<HTMLElement>("#sbpuce");
  if (dlg && pastille) {
    pastille.onclick = () => { listeBilansOuverte = true; dlg.showModal(); };
    el.querySelector<HTMLElement>("#sbfermer")!.onclick = () => { listeBilansOuverte = false; dlg.close(); };
    if (listeBilansOuverte) dlg.showModal();
  }
  const dlgA = el.querySelector<HTMLDialogElement>(".absdlg"), puceA = el.querySelector<HTMLElement>("#abpuce");
  if (dlgA && puceA) {
    puceA.onclick = () => { listeAbsentsOuverte = true; dlgA.showModal(); };
    el.querySelector<HTMLElement>("#abfermer")!.onclick = () => { listeAbsentsOuverte = false; dlgA.close(); };
    if (listeAbsentsOuverte) dlgA.showModal();
  }
  el.querySelectorAll<HTMLElement>("[data-ab]").forEach(z => {
    const id = z.dataset.ab!, n = Number(z.dataset.abn);
    z.querySelector<HTMLElement>("[data-abfiche]")!.onclick = () => { listeAbsentsOuverte = false; dlgA?.close(); surPatient(id); };
    z.querySelector<HTMLElement>("[data-abvu]")!.onclick = async () => {
      try { await db.modifierDossier(id, x => ({ ...x, absences_vu: n })); } catch { toast("L'enregistrement a échoué. Réessayez."); }
    };
  });
  el.querySelectorAll<HTMLElement>("[data-sb]").forEach(z => {
    const id = z.dataset.sb!;
    const on = (sel: string, f: () => Promise<void> | void) => { const b = z.querySelector<HTMLElement>(sel); if (b) b.onclick = async () => { try { await f(); } catch { toast("L'enregistrement a échoué. Réessayez."); } }; };
    on("[data-sbajout]", () => { listeBilansOuverte = false; dlg?.close(); surBilan(id); });   // le choix du fichier s'ouvre dans le même toucher
    on("[data-sbtard]", async () => { await db.modifierDossier(id, x => ({ ...x, bilan_plus_tard: decalerJours(auj, 7) })); });   // la ligne disparaît de la liste : pas de message en plus
    on("[data-sbnon]", async () => { await db.modifierDossier(id, x => ({ ...x, sans_bilan: true })); });
  });
  el.querySelectorAll<HTMLElement>("[data-vue]").forEach(b => b.onclick = () => { choix = b.dataset.vue as Vue; afficher(el, d, surPatient, surBilan); });
}

/* au retour sur l'appli un autre jour ou l'après-midi venu, l'appli choisit de nouveau la demi-journée */
export const revenirAujourdhui = () => { choix = null; };
