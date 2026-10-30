/* Dictée groupée : Corentin dicte tous ses patients à la suite, sans en ouvrir aucun.
   L'IA découpe la dictée par patient ; l'appli range seule quand un seul dossier convient et ne pose la question qu'en cas de doute.
   Un récapitulatif avec « Annuler » suit l'enregistrement. La dictée en cours est gardée dans la tablette à chaque mot. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import * as moteur from "./moteur";
import * as voix from "./transcription";
import { ageDossier, demiFr, isoDay, nomAffiche, nomCorrespond, patientFrom, type Dossier, type Rdv } from "./regles";
import { confirmer, esc, toast } from "./ui";

const BROUILLON = "dictee_brouillon";   // { texte, date }
const DOUTES = "dictee_doutes";         // passages en attente d'un choix de dossier

type Phase = "saisie" | "envoi" | "fini";
/* avant : rendez-vous des dossiers avant la dictée, pour « Annuler » ; crees : patients créés depuis la dictée (bilan à venir) */
type Recap = { range: moteur.Range[]; rdvs: string[]; texte: string; date: string; avant: Map<string, Rdv[]>; crees?: string[] };

let phase: Phase = "saisie";
let texte = "", date = "";
let doutes: moteur.Doute[] = [];
let dernier: Recap | null = null;       // dernière dictée rangée : récapitulatif et « Annuler »
let charge = false;
let ecran: HTMLElement | null = null;   // zone où la dictée est affichée, null si elle est fermée
let fermer: () => void = () => {};

/* dictée enregistrée (Whisper) : micro en cours, enregistrement en attente de transcription, transcription en cours */
let voixOk = false;
let enCours: voix.Enregistrement | null = null;
let audioEnAttente: Blob | null = null;
let transcription = false;
let chrono: ReturnType<typeof setInterval> | undefined;

const aujourdhui = () => isoDay(new Date());
const hier = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); };

async function charger() {
  if (charge) return;
  charge = true;
  const b = await db.lireParametre<{ texte: string; date: string }>(BROUILLON).catch(() => undefined);
  texte = b?.texte ?? ""; date = b?.date || aujourdhui();
  doutes = (await db.lireParametre<moteur.Doute[]>(DOUTES).catch(() => undefined)) ?? [];
}

let minuterie: ReturnType<typeof setTimeout> | undefined;
function garderBrouillon(tout_de_suite = false) {
  clearTimeout(minuterie);
  const ecrire = () => db.ecrireParametre(BROUILLON, texte.trim() ? { texte, date } : undefined).catch(() => {});
  if (tout_de_suite) return ecrire();
  minuterie = setTimeout(ecrire, 400);
}
const garderDoutes = () => db.ecrireParametre(DOUTES, doutes.length ? doutes : undefined).catch(() => {});

/* la dictée est-elle à l'écran avec du texte en cours de saisie (l'écran ne doit pas être redessiné sous les doigts) */
export const ouverte = () => !!ecran;

export async function ouvrir(zone: HTMLElement, surFermeture: () => void) {
  ecran = zone; fermer = surFermeture;
  await charger();
  if (phase === "fini" && !doutes.length && !dernier) phase = "saisie";
  await afficher();
  voix.disponible().then(ok => { if (ok !== voixOk) { voixOk = ok; afficher(); } });
  const ta = zone.querySelector<HTMLTextAreaElement>("#dtexte");
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

export function quitter() { ecran = null; garderBrouillon(true); }

const jourFr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

async function afficher() {
  const z = ecran;
  if (!z) return;
  const { dossiers, bilans } = await db.tout();
  const nom = (d: Dossier) => nomAffiche(d, ageDossier(bilans.filter(b => b.dossierId === d.id)), dossiers);
  const parId = new Map(dossiers.map(d => [d.id, d]));

  const recap = dernier && dernier.range.length ? `<div class="recap" role="status">
      <p><b>${dernier.range.length} séance${dernier.range.length > 1 ? "s rangées" : " rangée"}</b> : ${esc([...new Set(dernier.range.map(r => parId.get(r.dossierId)?.label ?? "?"))].join(", ").replace(/([^.])$/, "$1."))}</p>
      ${dernier.rdvs.map(m => `<p class="note">${esc(m)}</p>`).join("")}
      <div class="row"><button id="dannuler">Annuler cette dictée</button></div></div>` : "";

  const blocDoutes = doutes.length ? `<h3>${doutes.length === 1 ? "Un passage à ranger" : doutes.length + " passages à ranger"}</h3>
    <p class="note">L'appli n'a pas su à quel patient ${doutes.length === 1 ? "il appartient" : "ils appartiennent"}. Touchez le bon patient, ou créez-le s'il n'a pas encore de bilan dans l'appli.</p>
    ${doutes.map(d => {
      const cands = d.candidats.map(id => parId.get(id)).filter((x): x is Dossier => !!x);
      const rdvJour = (x: Dossier) => x.rdvs.find(r => r.d === d.date);
      const bouton = (x: Dossier) => `<button class="cand" data-doute="${esc(d.id)}" data-dossier="${esc(x.id)}">${esc(nom(x))}${rdvJour(x) ? `<small>${demiFr(rdvJour(x)!) ? "rendez-vous ce jour-là, " + demiFr(rdvJour(x)!) : "rendez-vous ce jour-là"}</small>` : ""}</button>`;
      const choix = cands.length <= 8
        ? `<div class="row">${cands.map(bouton).join("")}</div>`
        : `<div class="row">${cands.filter(rdvJour).map(bouton).join("")}</div>
           <div class="vedit"><select data-liste="${esc(d.id)}" aria-label="Choisir le patient">${cands.map(x => `<option value="${esc(x.id)}">${esc(nom(x))}</option>`).join("")}</select><button data-doute="${esc(d.id)}" data-depuis-liste="1">Ranger ici</button></div>`;
      return `<div class="doute">
        <p><b>${d.seance.nom ? "« " + esc(d.seance.nom) + " »" : "Patient non nommé"}</b>${!d.seance.nom ? "" : cands.some(x => nomCorrespond(d.seance.nom!, x.label)) ? " : plusieurs patients possibles" : " : patient non reconnu"}</p>
        <blockquote>${esc(d.seance.contenu.length > 400 ? d.seance.contenu.slice(0, 400) + "…" : d.seance.contenu)}</blockquote>
        ${choix}
        ${d.seance.nom && !cands.some(x => x.label === nouveauNom(d.seance.nom!)) ? `<div class="vedit creation"><input type="text" data-nouveau="${esc(d.id)}" value="${esc(nouveauNom(d.seance.nom))}" aria-label="Prénom et initiale du nouveau patient" autocomplete="off"><button class="creer" data-creer="${esc(d.id)}">Nouveau patient (bilan à venir), ranger ici</button></div>` : ""}
        <button class="ignorer" data-ignorer="${esc(d.id)}">Ne pas ranger ce passage</button>
      </div>`;
    }).join("")}` : "";

  const saisie = phase === "envoi"
    ? `<div class="wait encours" role="status">L'IA range votre dictée, patient par patient. Cela peut prendre une à deux minutes. Vous pouvez utiliser l'appli en attendant.</div>`
    : phase === "fini" && (doutes.length || dernier)
      ? `<div class="row"><button class="primary" id="dnouvelle">Nouvelle dictée</button></div>`
      : `<div class="jours" role="group" aria-label="Date des séances">
          <button data-jour="${aujourdhui()}" aria-pressed="${date === aujourdhui()}">Aujourd'hui</button>
          <button data-jour="${hier()}" aria-pressed="${date === hier()}">Hier</button>
          <input type="date" id="ddate" value="${esc(date)}" max="${aujourdhui()}" aria-label="Autre date">
        </div>
        ${blocVoix()}
        <textarea id="dtexte" placeholder="Touchez le micro du clavier et dictez tous vos patients à la suite : « Avec Marc D., … Ensuite Élisabeth G., … ». Rien à toucher entre deux patients.">${esc(texte)}</textarea>
        <p class="note">Séances du ${esc(jourFr(date))}. Votre dictée est gardée pendant que vous parlez : si le micro s'arrête, touchez-le à nouveau et continuez.</p>
        <div class="row"><button class="primary" id="dranger">Ranger la dictée</button></div>`;

  z.innerHTML = `<div class="dictee">
    <div class="head"><h2>Dictée groupée</h2><button id="dfermer">Fermer</button></div>
    ${recap}${blocDoutes}${saisie}</div>`;
  brancher(z);
}

/* nom proposé pour un patient pas encore dans l'appli : prénom et initiale, comme pour les bilans */
const nouveauNom = (dicte: string) => dicte.trim().includes(" ") ? patientFrom(dicte.trim()) : dicte.trim();

const duree = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

function blocVoix(): string {
  if (!voixOk && !enCours && !audioEnAttente) return "";
  if (enCours) return `<div class="voix enreg" role="status"><span class="point" aria-hidden="true"></span> Enregistrement <span id="vchrono">${duree(Date.now() - enCours.debut)}</span>
    <button class="primary" id="varreter">Arrêter et transcrire</button><button id="vannuler">Annuler</button></div>`;
  if (transcription) return `<div class="wait encours" role="status">Transcription de votre voix…</div>`;
  if (audioEnAttente) return `<div class="wait">L'enregistrement n'a pas pu être transcrit. Il est gardé.<div class="row" style="margin-top:10px"><button class="primary" id="vreessayer">Réessayer la transcription</button><button id="voublier">L'effacer</button></div></div>`;
  return `<div class="row"><button class="primary voixbtn" id="venreg">🎙️ Enregistrer ma dictée</button></div>`;
}

async function envoyerVoix() {
  if (!audioEnAttente) return;
  transcription = true; afficher();
  try {
    const t = await voix.transcrire(audioEnAttente);
    texte = texte.trim() ? texte.trimEnd() + "\n" + t : t;
    audioEnAttente = null;
    await garderBrouillon(true);
    toast("Dictée transcrite. Relisez-la si besoin, puis touchez « Ranger la dictée ».");
  } catch (e) { toast(e instanceof ErreurIA ? e.message : "La transcription a échoué."); }
  transcription = false; afficher();
}

function brancher(z: HTMLElement) {
  const venreg = z.querySelector<HTMLElement>("#venreg");
  if (venreg) venreg.onclick = async () => {
    try { enCours = await voix.enregistrer(); } catch (e) { toast(e instanceof ErreurIA ? e.message : "Le micro n'a pas pu démarrer."); return; }
    chrono = setInterval(() => { const c = document.querySelector("#vchrono"); if (c && enCours) c.textContent = duree(Date.now() - enCours.debut); }, 1000);
    afficher();
  };
  const varreter = z.querySelector<HTMLElement>("#varreter");
  if (varreter) varreter.onclick = async () => {
    const e = enCours; if (!e) return;
    clearInterval(chrono); enCours = null;
    audioEnAttente = await e.arreter();
    envoyerVoix();
  };
  const vannuler = z.querySelector<HTMLElement>("#vannuler");
  if (vannuler) vannuler.onclick = () => { clearInterval(chrono); enCours?.annuler(); enCours = null; afficher(); };
  const vre = z.querySelector<HTMLElement>("#vreessayer");
  if (vre) vre.onclick = envoyerVoix;
  const voub = z.querySelector<HTMLElement>("#voublier");
  if (voub) voub.onclick = async () => { if (await confirmer("Effacer cet enregistrement ? Il n'a pas été transcrit.", "L'effacer")) { audioEnAttente = null; afficher(); } };

  z.querySelector<HTMLElement>("#dfermer")!.onclick = () => { quitter(); fermer(); };
  const ta = z.querySelector<HTMLTextAreaElement>("#dtexte");
  if (ta) ta.oninput = () => { texte = ta.value; garderBrouillon(); };
  z.querySelectorAll<HTMLButtonElement>("[data-jour]").forEach(b => b.onclick = () => { date = b.dataset.jour!; garderBrouillon(); afficher(); });
  const dd = z.querySelector<HTMLInputElement>("#ddate");
  if (dd) dd.onchange = () => { if (dd.value) { date = dd.value; garderBrouillon(); afficher(); } };
  const ranger = z.querySelector<HTMLButtonElement>("#dranger");
  if (ranger) ranger.onclick = lancer;
  const nouvelle = z.querySelector<HTMLButtonElement>("#dnouvelle");
  if (nouvelle) nouvelle.onclick = () => { dernier = null; phase = "saisie"; afficher(); };
  const annuler = z.querySelector<HTMLButtonElement>("#dannuler");
  if (annuler) annuler.onclick = annulerDictee;

  z.querySelectorAll<HTMLButtonElement>("[data-doute]").forEach(b => b.onclick = async () => {
    const d = doutes.find(x => x.id === b.dataset.doute);
    const dossierId = b.dataset.depuisListe ? z.querySelector<HTMLSelectElement>(`select[data-liste="${d?.id}"]`)?.value : b.dataset.dossier;
    if (!d || !dossierId) return;
    b.disabled = true;
    try {
      if (!dernier) dernier = { range: [], rdvs: [], texte: "", date: d.date, avant: new Map() };
      const avant = (await db.tout()).dossiers.find(x => x.id === dossierId);
      if (avant && !dernier.avant.has(dossierId)) dernier.avant.set(dossierId, avant.rdvs);
      const r = await moteur.rangerSeance(dossierId, d.date, d.seance);
      dernier.range.push(r.range); if (r.rdv) dernier.rdvs.push(r.rdv);
      doutes = doutes.filter(x => x.id !== d.id); await garderDoutes();
      toast("Séance rangée.");
    } catch { toast("L'enregistrement a échoué. Réessayez."); }
    afficher();
  });
  /* patient pas encore dans l'appli (pas de bilan ajouté) : créé « bilan à venir », puis le passage y est rangé */
  z.querySelectorAll<HTMLButtonElement>("[data-creer]").forEach(b => b.onclick = async () => {
    const d = doutes.find(x => x.id === b.dataset.creer);
    const saisi = z.querySelector<HTMLInputElement>(`[data-nouveau="${b.dataset.creer}"]`)?.value.trim() ?? "";
    if (!d) return;
    const label = nouveauNom(saisi);
    if (!/\s\S/.test(label)) { toast("Ajoutez l'initiale du nom de famille (« Véronique H. »)."); return; }
    b.disabled = true;
    try {
      const patient = await db.creerPatient(label);
      if (!dernier) dernier = { range: [], rdvs: [], texte: "", date: d.date, avant: new Map() };
      (dernier.crees ??= []).push(patient.id);
      const r = await moteur.rangerSeance(patient.id, d.date, d.seance);
      dernier.range.push(r.range); if (r.rdv) dernier.rdvs.push(r.rdv);
      doutes = doutes.filter(x => x.id !== d.id); await garderDoutes();
      toast(`${label} créé (bilan à venir), séance rangée.`);
    } catch (e) {
      b.disabled = false;
      toast(/existe déjà/.test(String((e as Error)?.message)) ? "Un patient porte déjà ce nom : touchez-le plus haut, ou ajoutez la 2e lettre du nom (« Véronique Ha. »)." : "L'enregistrement a échoué. Réessayez.");
    }
    afficher();
  });
  z.querySelectorAll<HTMLButtonElement>("[data-ignorer]").forEach(b => b.onclick = async () => {
    if (!await confirmer("Ne pas ranger ce passage ? Il ne sera enregistré dans aucun dossier.", "Ne pas le ranger")) return;
    doutes = doutes.filter(x => x.id !== b.dataset.ignorer); await garderDoutes();
    afficher();
  });
}

async function lancer() {
  if (!texte.trim()) { toast("Dictez d'abord vos séances."); return; }
  if (doutes.length) { toast("Rangez d'abord les passages en attente, plus haut."); return; }
  await garderBrouillon(true);
  phase = "envoi"; afficher();
  const envoye = texte, jour = date;
  try {
    const avant = new Map((await db.tout()).dossiers.map(d => [d.id, d.rdvs] as const));
    const r = await moteur.rangerDictee(jour, envoye);
    dernier = { range: r.ranges, rdvs: r.rdvs, texte: envoye, date: jour, avant };
    doutes = r.doutes; await garderDoutes();
    texte = ""; date = aujourdhui(); await garderBrouillon(true);
    phase = "fini";
    const n = r.ranges.length, m = r.doutes.length;
    toast(n ? `${n} séance${n > 1 ? "s rangées" : " rangée"}${m ? `, ${m} à ranger à la main` : ""}.` : `${m} passage${m > 1 ? "s" : ""} à ranger à la main.`);
  } catch (e) {
    phase = "saisie";
    toast(e instanceof ErreurIA ? e.message : "La dictée n'a pas pu être rangée. Elle est gardée : réessayez.");
  }
  afficher();
}

/* « Annuler » : les séances de cette dictée disparaissent, les rendez-vous redeviennent ce qu'ils étaient,
   et la dictée revient dans la zone de texte pour être corrigée ou relancée. */
async function annulerDictee() {
  if (!dernier) return;
  if (!await confirmer(`Annuler cette dictée ? Ses ${dernier.range.length} séance(s) sont retirées des dossiers et le texte dicté revient pour être corrigé.`, "Annuler la dictée")) return;
  try {
    for (const r of dernier.range) await db.supprimerSeance(r.seanceId);
    /* les patients créés pendant cette dictée disparaissent aussi, s'ils n'ont rien reçu d'autre depuis */
    const apres = await db.tout();
    for (const id of dernier.crees ?? [])
      if (!apres.bilans.some(b => b.dossierId === id) && !apres.seances.some(s => s.dossierId === id)) await db.supprimerPatient(id);
    const { dossiers } = await db.tout();
    for (const [id, rdvs] of dernier.avant) {
      const d = dossiers.find(x => x.id === id);
      if (d && JSON.stringify(d.rdvs) !== JSON.stringify(rdvs)) await db.setRdvs(id, rdvs);
    }
    if (dernier.texte) { texte = dernier.texte; date = dernier.date; await garderBrouillon(true); }
    dernier = null; doutes = []; await garderDoutes();
    phase = "saisie";
    toast("Dictée annulée.");
  } catch { toast("L'annulation a échoué."); }
  afficher();
}
