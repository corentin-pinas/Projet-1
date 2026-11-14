/* Dictée groupée : Corentin dicte tous ses patients à la suite, sans en ouvrir aucun.
   L'IA découpe la dictée par patient ; l'appli range seule quand un seul dossier convient et ne pose la question qu'en cas de doute.
   Un récapitulatif avec « Annuler » suit l'enregistrement. La dictée en cours est gardée dans la tablette à chaque mot.
   Depuis la 1.9.0, la dictée est confiée au PC quand il est relié et prêt (travail-pc.ts) : il la transcrit et la range en
   tâche de fond, Corentin peut fermer Muninn. PC injoignable : rangée ici, comme avant. Dans les deux cas, le récapitulatif
   et les passages à ranger sont gardés dans les travaux partagés : ils s'affichent sur tous les appareils. */
import * as db from "./db";
import { ErreurIA } from "./ia";
import * as moteur from "./moteur";
import * as prochain from "./prochain-rdv";
import * as objectifs from "./objectifs";
import { phrase, Relanceur } from "./relance";
import * as manquantes from "./seances-manquantes";
import { Enregistreur } from "./enregistreur";
import { eveil } from "./transcription";
import * as travailPC from "./travail-pc";
import type { Travail } from "./travail-pc";
import { ageDossier, demiDe, demiFr, estArchive, frDate, isoDay, rdvsDuJour, nomAffiche, nomCorrespond, patientFrom, questionRdv, sansSeanceCeJour, type Dossier } from "./regles";
import { confirmer, esc, toast } from "./ui";

const BROUILLON = "dictee_brouillon";   // { texte, date }
const VOIX_GARDEE = "voix_attente_dictee";   // enregistrement pas encore transcrit, gardé dans la base (audit M1)
const DOUTES = "dictee_doutes";         // avant la 1.9.0 : passages en attente d'un choix de dossier (repris dans un travail)

/* envoi : rangement en cours sur cet appareil (PC injoignable) */
type Phase = "saisie" | "envoi";
let phase: Phase = "saisie";
let saisieLibre = false;                // « Nouvelle dictée » : la zone de texte revient même si des passages restent à ranger
let texte = "", date = "";
let charge = false;

/* Les dictées rangées (par le PC ou ici) : récapitulatif, passages à ranger, « Annuler ». Un travail fini garde
   ranges (séances rangées), doutes, rdvs (messages), rdvs_avant / rdvs_apres (rendez-vous des dossiers touchés, avant et
   juste après leur rangement, pour « Annuler »), crees (patients créés depuis la dictée, bilan à venir). */
const dictees = () => travailPC.liste().filter(t => t.type === "dictee");
const recaps = () => dictees().filter(t => t.etat === "fini" && !t.vu && t.ranges?.length);
const enAttente = () => dictees().filter(t => t.etat !== "fini");
const doutesDe = () => dictees().filter(t => t.etat === "fini").flatMap(t => (t.doutes ?? []).map(d => ({ t, d })));
let ecran: HTMLElement | null = null;   // zone où la dictée est affichée, null si elle est fermée
let fermer: () => void = () => {};

/* relance automatique du rangement après un échec (5 min, 3 essais au plus) ; la voix a les siennes dans l'enregistreur */
const relanceRange = new Relanceur(essai => { lancer(essai); }, () => { afficher(); });

/* dictée enregistrée (Whisper) : l'enregistreur commun avec « Enregistrer ma séance » (audit A2) */
const enr = new Enregistreur({
  id: "v", libelle: "Enregistrer ma dictée", enTranscription: "Transcription de votre voix…",
  noms: () => nomsDuJour(),
  garder: son => db.ecrireParametre(VOIX_GARDEE, son),
  oublier: () => db.ecrireParametre(VOIX_GARDEE, undefined),
  /* 1.9.0 : l'enregistrement confié au PC, qui le transcrit et le range ; le texte déjà tapé passe devant */
  envoyer: async son => {
    const a = await travailPC.accepte();
    if (!a) return false;
    await travailPC.confier(a, { type: "dictee", date, ...(texte.trim() ? { debut: texte.trim() } : {}) }, son);
    texte = ""; date = aujourdhui(); saisieLibre = false; await garderBrouillon(true);
    toast("Enregistrement envoyé au PC : il le transcrit et range la dictée. Vous pouvez fermer Muninn.");
    return true;
  },
  /* choix de Corentin : la dictée transcrite est rangée tout de suite, sans relecture ;
     le texte dicté reste consultable dans chaque séance et « Annuler cette dictée » défait tout */
  transcrit: async t => {
    texte = texte.trim() ? texte.trimEnd() + "\n" + t : t;
    await garderBrouillon(true);
    await lancer();
  },
  redessiner: () => { afficher(); }
});

/* les patients qui ont rendez-vous le jour de la dictée : Whisper écrit leurs noms juste */
async function nomsDuJour(): Promise<string[]> {
  const t = await db.tout().catch(() => null);
  return t ? [...new Set(rdvsDuJour(t.dossiers, date).map(r => r.dossier.label))] : [];
}
const aujourdhui = () => isoDay(new Date());
const hier = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoDay(d); };

async function charger() {
  if (charge) return;
  charge = true;
  const b = await db.lireParametre<{ texte: string; date: string }>(BROUILLON).catch(() => undefined);
  if (!enr.attente && !enr.enCours) enr.attente = (await db.lireParametre<Blob>(VOIX_GARDEE).catch(() => undefined)) ?? null;
  texte = b?.texte ?? ""; date = b?.date || aujourdhui();
  /* passages en attente d'avant la 1.9.0 : repris dans un travail, comme ceux d'aujourd'hui */
  const anciens = (await db.lireParametre<moteur.Doute[]>(DOUTES).catch(() => undefined)) ?? [];
  if (anciens.length) {
    await travailPC.ajouterLocal({ id: crypto.randomUUID(), type: "dictee", date: anciens[0].date, cree: new Date().toISOString(), etat: "fini", essais: 0, local: true, ranges: [], doutes: anciens, vu: true }).catch(() => {});
    await db.ecrireParametre(DOUTES, undefined).catch(() => {});
  }
}

let minuterie: ReturnType<typeof setTimeout> | undefined;
function garderBrouillon(tout_de_suite = false) {
  clearTimeout(minuterie);
  const ecrire = () => db.ecrireParametre(BROUILLON, texte.trim() ? { texte, date } : undefined).catch(() => {});
  if (tout_de_suite) return ecrire();
  minuterie = setTimeout(ecrire, 400);
}

/* la dictée est-elle à l'écran avec du texte en cours de saisie (l'écran ne doit pas être redessiné sous les doigts) */
export const ouverte = () => !!ecran;

/* ce qu'affiche le bas de l'écran : rangement en cours ici, bouton « Nouvelle dictée » (récapitulatif ou passages à
   ranger à l'écran), ou la zone de texte (toujours, dès que Corentin a commencé à taper) */
type Bas = "envoi" | "nouvelle" | "texte";
const zoneSaisie = (): Bas => phase === "envoi" ? "envoi"
  : (recaps().length || (doutesDe().length && !saisieLibre)) && !texte.trim() ? "nouvelle" : "texte";
let basAffiche: Bas | null = null;

/* les travaux changent (le PC avance, un autre appareil range un passage) : seul le haut de l'écran est redessiné tant que
   le bas ne change pas, pour ne pas retirer la zone de texte sous les doigts de Corentin */
travailPC.abonner(() => {
  if (!ecran) return;
  if (zoneSaisie() === basAffiche) afficherHaut(); else afficher();
});

export async function ouvrir(zone: HTMLElement, surFermeture: () => void) {
  ecran = zone; fermer = surFermeture;
  await charger();
  await afficher();
  enr.verifierDispo();
  const ta = zone.querySelector<HTMLTextAreaElement>("#dtexte");
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

export function quitter() { ecran = null; garderBrouillon(true); }

const jourFr = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* le haut : dictées confiées au PC pas encore rangées, récapitulatifs, passages à ranger */
async function htmlHaut(): Promise<string> {
  const { dossiers, bilans, seances } = await db.tout();
  const nom = (d: Dossier) => nomAffiche(d, ageDossier(bilans.filter(b => b.dossierId === d.id)), dossiers);
  const parId = new Map(dossiers.map(d => [d.id, d]));

  const pc = enAttente().map(t => t.etat === "erreur"
    ? `<div class="wait relance pcdictee" role="status">⚠ <b>Dictée du ${esc(jourFr(t.date))} pas rangée par le PC :</b> ${esc(t.erreur ?? "erreur inconnue.")}
        <div class="row" style="margin-top:10px"><button class="primary" data-pcrelancer="${esc(t.id)}">Réessayer</button>${t.texte ? `<button data-pcreprendre="${esc(t.id)}">Remettre le texte dans la dictée</button>` : ""}</div></div>`
    : `<div class="wait encours pcdictee" role="status">🖥️ <b>Dictée du ${esc(jourFr(t.date))} :</b> ${t.etat === "transcription" ? "transcription de votre voix sur le PC…" : t.etat === "rangement" ? "rangement sur le PC, patient par patient…" : "confiée au PC."}
        Vous pouvez fermer Muninn : elle sera rangée toute seule.${t.erreur ? `<br><small>Dernier essai : ${esc(t.erreur)}${t.prochain ? ` Nouvel essai vers ${esc(heure(t.prochain))}.` : ""}</small>` : ""}</div>`).join("");

  const recap = recaps().map(t => {
    const range = t.ranges!;
    const ids = [...new Set(range.map(r => r.dossierId))];
    return `<div class="recap" role="status" data-travail="${esc(t.id)}">
      <p><b>${range.length} séance${range.length > 1 ? "s rangées" : " rangée"}</b> : ${esc([...new Set(range.map(r => parId.get(r.dossierId)?.label ?? "?"))].join(", ").replace(/([^.])$/, "$1."))}${t.local ? "" : ` <small>(rangée par le PC)</small>`}</p>
      ${(t.rdvs ?? []).map(m => `<p class="note">${esc(m)}</p>`).join("")}
      ${range.filter(r => r.prenomSeul).map(r => parId.get(r.dossierId)).filter((x): x is Dossier => !!x).map(D =>
        `<p class="prenomseul">⚠ <b>${esc(D.label)}</b> : rangé d'après le nom seul (pas de rendez-vous noté ce jour-là). Vérifiez que c'est bien ce patient.</p>`).join("")}
      ${ids.map(id => parId.get(id)).filter((x): x is Dossier => !!x).map(D => {
        const q = questionRdv(D, seances, aujourdhui());
        return (q ? prochain.question(D, q, D.label) : "") + prochain.retraits(D, D.label) + objectifs.proposition(D, D.label);
      }).join("")}
      ${sansSeanceCeJour(dossiers, seances, t.date).map(D => {
        const r = D.rdvs.find(x => x.d === t.date);
        return manquantes.bloc(D, t.date, r ? demiDe(r) : null, D.label);
      }).join("")}
      <div class="row"><button data-annuler="${esc(t.id)}">Annuler cette dictée</button></div></div>`;
  }).join("");

  const ds = doutesDe();
  const blocDoutes = ds.length ? `<h3>${ds.length === 1 ? "Un passage à ranger" : ds.length + " passages à ranger"}</h3>
    <p class="note">L'appli n'a pas su à quel patient ${ds.length === 1 ? "il appartient" : "ils appartiennent"}. Touchez le bon patient, ou créez-le s'il n'a pas encore de bilan dans l'appli.</p>
    ${ds.map(({ d }) => {
      const cands = d.candidats.map(id => parId.get(id)).filter((x): x is Dossier => !!x);
      const rdvJour = (x: Dossier) => x.rdvs.find(r => r.d === d.date);
      const bouton = (x: Dossier) => `<button class="cand" data-doute="${esc(d.id)}" data-dossier="${esc(x.id)}">${esc(nom(x))}${rdvJour(x) ? `<small>${demiFr(rdvJour(x)!) ? "rendez-vous ce jour-là, " + demiFr(rdvJour(x)!) : "rendez-vous ce jour-là"}</small>` : estArchive(x) ? `<small>dossier archivé (fin le ${esc(frDate(x.fin!))}) : il sera rouvert</small>` : ""}</button>`;
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
  return pc + recap + blocDoutes;
}

function htmlBas(bas: Bas): string {
  if (bas === "envoi") return `<div class="wait encours" role="status">L'IA range votre dictée, patient par patient. Cela peut prendre une à deux minutes. Vous pouvez utiliser l'appli en attendant.</div>`;
  if (bas === "nouvelle") return `<div class="row"><button class="primary" id="dnouvelle">Nouvelle dictée</button></div>`;
  return `<div class="jours" role="group" aria-label="Date des séances">
      <button data-jour="${aujourdhui()}" aria-pressed="${date === aujourdhui()}">Aujourd'hui</button>
      <button data-jour="${hier()}" aria-pressed="${date === hier()}">Hier</button>
      <input type="date" id="ddate" value="${esc(date)}" max="${aujourdhui()}" aria-label="Autre date">
    </div>
    ${enr.html()}
    ${relanceRange.plan ? `<div class="wait relance" role="status">⏳ <b>Rangement pas encore fait :</b> ${esc(relanceRange.plan.cause)}<br>${phrase(relanceRange.plan)} Votre dictée est gardée.
      <div class="row" style="margin-top:10px"><button class="primary" id="drelance">Réessayer maintenant</button></div></div>` : ""}
    <textarea id="dtexte" placeholder="Touchez le micro du clavier et dictez tous vos patients à la suite : « Avec Marc D., … Ensuite Élisabeth G., … ». Rien à toucher entre deux patients.">${esc(texte)}</textarea>
    <p class="note">Séances du ${esc(jourFr(date))}. Votre dictée est gardée pendant que vous parlez : si le micro s'arrête, touchez-le à nouveau et continuez.</p>
    <div class="row"><button class="primary" id="dranger">Ranger la dictée</button></div>`;
}

async function afficher() {
  const z = ecran;
  if (!z) return;
  const haut = await htmlHaut();
  if (ecran !== z) return;
  const bas = zoneSaisie();
  basAffiche = bas;
  z.innerHTML = `<div class="dictee">
    <div class="head"><h2>Dictée groupée</h2><button id="dfermer">Fermer</button></div>
    <div id="dhaut">${haut}</div><div id="dbas">${htmlBas(bas)}</div></div>`;
  brancherHaut(z);
  brancherBas(z);
}

async function afficherHaut() {
  const z = ecran;
  const h = z?.querySelector<HTMLElement>("#dhaut");
  if (!z || !h) return afficher();
  const html = await htmlHaut();
  if (ecran !== z || !h.isConnected) return;
  h.innerHTML = html;
  brancherHaut(h);
}

/* nom proposé pour un patient pas encore dans l'appli : prénom et initiale, comme pour les bilans */
const nouveauNom = (dicte: string) => dicte.trim().includes(" ") ? patientFrom(dicte.trim()) : dicte.trim();

const travailDu = (douteId: string) => doutesDe().find(x => x.d.id === douteId);

/* un passage rangé à la main rejoint le récapitulatif de sa dictée (et son « Annuler ») */
async function rangerDoute(t: Travail, d: moteur.Doute, dossierId: string, cree?: string) {
  const avant = (await db.tout()).dossiers.find(x => x.id === dossierId)?.rdvs;
  const r = await moteur.rangerSeance(dossierId, d.date, d.seance);
  const apres = (await db.tout()).dossiers.find(x => x.id === dossierId)?.rdvs ?? [];
  saisieLibre = false;
  await travailPC.modifier(t.id, x => ({
    ...x, vu: false,
    doutes: (x.doutes ?? []).filter(y => y.id !== d.id),
    ranges: [...(x.ranges ?? []), r.range],
    rdvs: r.rdv ? [...(x.rdvs ?? []), r.rdv] : x.rdvs ?? [],
    rdvs_avant: { ...(x.rdvs_avant ?? {}), ...(x.rdvs_avant?.[dossierId] || !avant ? {} : { [dossierId]: avant }) },
    rdvs_apres: { ...(x.rdvs_apres ?? {}), [dossierId]: apres },
    crees: cree ? [...(x.crees ?? []), cree] : x.crees
  }));
}

function brancherHaut(z: HTMLElement) {
  prochain.brancher(z, () => { afficherHaut(); });
  objectifs.brancher(z, null, () => { afficherHaut(); });
  manquantes.brancher(z, () => { afficherHaut(); });

  z.querySelectorAll<HTMLButtonElement>("[data-annuler]").forEach(b => b.onclick = () => annulerDictee(b.dataset.annuler!));
  z.querySelectorAll<HTMLButtonElement>("[data-pcrelancer]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await travailPC.relancer(b.dataset.pcrelancer!); toast("Le PC va réessayer."); } catch { toast("L'enregistrement a échoué. Réessayez."); b.disabled = false; }
  });
  z.querySelectorAll<HTMLButtonElement>("[data-pcreprendre]").forEach(b => b.onclick = async () => {
    const t = dictees().find(x => x.id === b.dataset.pcreprendre);
    if (!t?.texte) return;
    texte = texte.trim() ? texte.trimEnd() + "\n" + t.texte : t.texte; date = t.date;
    await garderBrouillon(true);
    await travailPC.retirer(t.id).catch(() => {});
    afficher();
  });

  z.querySelectorAll<HTMLButtonElement>("[data-doute]").forEach(b => b.onclick = async () => {
    const x = travailDu(b.dataset.doute!);
    const dossierId = b.dataset.depuisListe ? z.querySelector<HTMLSelectElement>(`select[data-liste="${x?.d.id}"]`)?.value : b.dataset.dossier;
    if (!x || !dossierId) return;
    b.disabled = true;
    try { await rangerDoute(x.t, x.d, dossierId); toast("Séance rangée."); }
    catch { toast("L'enregistrement a échoué. Réessayez."); }
    afficher();
  });
  /* patient pas encore dans l'appli (pas de bilan ajouté) : créé « bilan à venir », puis le passage y est rangé */
  z.querySelectorAll<HTMLButtonElement>("[data-creer]").forEach(b => b.onclick = async () => {
    const x = travailDu(b.dataset.creer!);
    const saisi = z.querySelector<HTMLInputElement>(`[data-nouveau="${b.dataset.creer}"]`)?.value.trim() ?? "";
    if (!x) return;
    const label = nouveauNom(saisi);
    if (!/\s\S/.test(label)) { toast("Ajoutez l'initiale du nom de famille (« Véronique H. »)."); return; }
    b.disabled = true;
    try {
      const patient = await db.creerPatient(label);
      await rangerDoute(x.t, x.d, patient.id, patient.id);
      toast(`${label} créé (bilan à venir), séance rangée.`);
    } catch (e) {
      b.disabled = false;
      toast(/existe déjà/.test(String((e as Error)?.message)) ? "Un patient porte déjà ce nom : touchez-le plus haut, ou ajoutez la 2e lettre du nom (« Véronique Ha. »)." : "L'enregistrement a échoué. Réessayez.");
    }
    afficher();
  });
  z.querySelectorAll<HTMLButtonElement>("[data-ignorer]").forEach(b => b.onclick = async () => {
    if (!await confirmer("Ne pas ranger ce passage ? Il ne sera enregistré dans aucun dossier.", "Ne pas le ranger")) return;
    const x = travailDu(b.dataset.ignorer!);
    if (x) await travailPC.modifier(x.t.id, t => ({ ...t, doutes: (t.doutes ?? []).filter(y => y.id !== x.d.id) })).catch(() => {});
    afficher();
  });
}

function brancherBas(z: HTMLElement) {
  enr.brancher(z);
  z.querySelector<HTMLElement>("#dfermer")!.onclick = () => { quitter(); fermer(); };
  const ta = z.querySelector<HTMLTextAreaElement>("#dtexte");
  if (ta) ta.oninput = () => { texte = ta.value; garderBrouillon(); };
  z.querySelectorAll<HTMLButtonElement>("[data-jour]").forEach(b => b.onclick = () => { date = b.dataset.jour!; garderBrouillon(); afficher(); });
  const dd = z.querySelector<HTMLInputElement>("#ddate");
  if (dd) dd.onchange = () => { if (dd.value) { date = dd.value; garderBrouillon(); afficher(); } };
  const ranger = z.querySelector<HTMLButtonElement>("#dranger");
  if (ranger) ranger.onclick = () => { relanceRange.annuler(); lancer(); };
  const drelance = z.querySelector<HTMLButtonElement>("#drelance");
  if (drelance) drelance.onclick = () => relanceRange.maintenant();
  const nouvelle = z.querySelector<HTMLButtonElement>("#dnouvelle");
  if (nouvelle) nouvelle.onclick = async () => {
    saisieLibre = true;
    for (const t of recaps()) await travailPC.modifier(t.id, x => ({ ...x, vu: true })).catch(() => {});
    afficher();
  };
}

async function lancer(essai = 1) {
  relanceRange.annuler();
  if (phase === "envoi") return;
  if (!texte.trim()) { if (essai === 1) toast("Dictez d'abord vos séances."); return; }
  await garderBrouillon(true);
  const envoye = texte, jour = date;
  await db.garderDictee(jour, envoye).catch(() => {});   // gardée telle que dictée, même si le rangement échoue (audit E3)
  /* le PC d'abord (1.9.0) : il range en tâche de fond ; injoignable, rangée ici comme avant */
  const acces = await travailPC.accepte();
  if (acces) {
    try {
      await travailPC.confier(acces, { type: "dictee", date: jour, texte: envoye });
      texte = ""; date = aujourdhui(); saisieLibre = false; await garderBrouillon(true);
      toast("Dictée envoyée au PC : il la range patient par patient. Vous pouvez fermer Muninn.");
      afficher();
      return;
    } catch { /* PC injoignable : rangée ici */ }
  }
  phase = "envoi"; afficher();
  const relacher = eveil();   // une longue dictée peut prendre plusieurs minutes : l'écran reste allumé
  try {
    const avant = new Map((await db.tout()).dossiers.map(d => [d.id, d.rdvs] as const));
    const r = await moteur.rangerDictee(jour, envoye);
    const touches = [...new Set(r.ranges.map(x => x.dossierId))];
    const apres = new Map((await db.tout()).dossiers.map(d => [d.id, d.rdvs] as const));
    await travailPC.ajouterLocal({
      id: crypto.randomUUID(), type: "dictee", date: jour, texte: envoye, cree: new Date().toISOString(), fini: new Date().toISOString(),
      etat: "fini", essais: 1, local: true, appareil: await db.appareil(),
      ranges: r.ranges, doutes: r.doutes, rdvs: r.rdvs,
      rdvs_avant: Object.fromEntries(touches.map(id => [id, avant.get(id) ?? []])),
      rdvs_apres: Object.fromEntries(touches.map(id => [id, apres.get(id) ?? []]))
    });
    texte = ""; date = aujourdhui(); saisieLibre = false; await garderBrouillon(true);
    phase = "saisie";
    const n = r.ranges.length, m = r.doutes.length;
    toast(n ? `${n} séance${n > 1 ? "s rangées" : " rangée"}${m ? `, ${m} à ranger à la main` : ""}.` : `${m} passage${m > 1 ? "s" : ""} à ranger à la main.`);
  } catch (e) {
    phase = "saisie";
    const p = relanceRange.echec(e, essai);
    const cause = e instanceof ErreurIA ? e.message : "La dictée n'a pas pu être rangée.";
    toast(cause + (p ? (p.quand == null ? " Votre dictée est gardée : nouvel essai au retour du réseau." : " Votre dictée est gardée : nouvel essai dans 5 minutes.") : " Votre dictée est gardée."));
  } finally { relacher(); }
  afficher();
}

/* « Annuler » : les séances de cette dictée disparaissent, les rendez-vous redeviennent ce qu'ils étaient,
   et la dictée revient dans la zone de texte pour être corrigée ou relancée. */
async function annulerDictee(id: string) {
  const t = dictees().find(x => x.id === id);
  if (!t) return;
  const range = t.ranges ?? [];
  if (!await confirmer(`Annuler cette dictée ? Ses ${range.length} séance(s) sont retirées des dossiers et le texte dicté revient pour être corrigé.`, "Annuler la dictée")) return;
  try {
    for (const r of range) await db.supprimerSeance(r.seanceId).catch(() => {});
    /* les patients créés pendant cette dictée disparaissent aussi, s'ils n'ont rien reçu d'autre depuis */
    const apres = await db.tout();
    for (const pid of t.crees ?? [])
      if (!apres.bilans.some(b => b.dossierId === pid) && !apres.seances.some(s => s.dossierId === pid)) await db.supprimerPatient(pid);
    const { dossiers } = await db.tout();
    /* seuls les dossiers rangés par cette dictée, et seulement si leurs rendez-vous sont encore ceux laissés par la dictée :
       un rendez-vous posé depuis (ici ou sur un autre appareil) n'est jamais effacé (audit M4) */
    const touches = new Set(range.map(r => r.dossierId));
    for (const [pid, rdvs] of Object.entries(t.rdvs_avant ?? {})) {
      if (!touches.has(pid)) continue;
      const d = dossiers.find(x => x.id === pid), laisses = t.rdvs_apres?.[pid];
      if (d && laisses && JSON.stringify(d.rdvs) === JSON.stringify(laisses) && JSON.stringify(d.rdvs) !== JSON.stringify(rdvs))
        await db.modifierRdvs(pid, actuels => JSON.stringify(actuels) === JSON.stringify(laisses) ? rdvs : actuels);   // revérifié au moment d'écrire
    }
    if (t.texte) { texte = t.texte; date = t.date; await garderBrouillon(true); }
    await travailPC.retirer(t.id);
    saisieLibre = false;
    phase = "saisie";
    toast("Dictée annulée.");
  } catch { toast("L'annulation a échoué."); }
  afficher();
}
