/* Travail de l'IA en arrière-plan : résumé automatique des bilans déposés,
   analyse des séances enregistrées. Rien n'est envoyé sans clé, ni sans connexion. */
import * as db from "./db";
import { analyserSeance, appelerAbonnement, appelerClaude, chercherDansDictee, corrigerResume, decouperDictee, ErreurIA, resumerBilan, parleRdv, type AnalyseSeance, type Appel, type Correction, type PieceBilan, type SeanceDictee } from "./ia";
import { Relanceur } from "./relance";
import { avecRdv, avenirFrom, empreinteTexte, estArchive, DEMI_FR, demiSeance, isoDay, jourLabel, rattacher, type Bilan, type Seance } from "./regles";

const enCours = new Set<string>();      // identifiants des bilans et séances en cours de traitement
const tentes = new Set<string>();       // bilans déjà tentés automatiquement depuis l'ouverture de l'appli
const abonnes = new Set<() => void>();

export const occupe = (id: string) => enCours.has(id);

/* Deux fenêtres de Muninn sur le même appareil : un même travail d'IA n'est fait que par l'une d'elles, l'autre passe
   son tour (pas de quota consommé deux fois ; audit F10). Sans ce mécanisme (vieux navigateur), comme avant. */
async function seul(cle: string, f: () => Promise<void>): Promise<void> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return f();
  await locks.request("muninn-ia:" + cle, { ifAvailable: true }, async l => { if (l) await f(); });
}
export function abonner(fn: () => void) { abonnes.add(fn); return () => abonnes.delete(fn); }
const prevenir = () => abonnes.forEach(fn => fn());

let messages: (t: string) => void = () => {};
export function surMessage(fn: (t: string) => void) { messages = fn; }

/* Mode de l'IA : par l'abonnement (Claude Code sur le serveur de l'appli), ou en secours par une clé API.
   La clé API n'est utilisée que si elle a été autorisée dans les réglages : sinon elle reste verrouillée. */
export type ConfigIA = { mode: "abonnement" | "api"; secret: string; appel: Appel };

export async function configIA(): Promise<ConfigIA | null> {
  const apiAutorisee = (await db.lireParametre<boolean>("api_autorisee")) === true;
  if (apiAutorisee && (await db.lireParametre<string>("mode_ia")) === "api") {
    const cle = await db.lireParametre<string>("cle_ia");
    return cle ? { mode: "api", secret: cle, appel: appelerClaude } : null;
  }
  const code = await db.lireParametre<string>("code_acces");
  return code ? { mode: "abonnement", secret: code, appel: appelerAbonnement } : null;
}

const PAS_REGLE = "Réglez d'abord l'IA dans « État de l'appli », en bas de la liste.";

async function base64(blob: Blob): Promise<string> {
  const url: string = await new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error);
    r.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/* Les photos de tablette sont lourdes : on les réduit (2000 px au plus) avant l'envoi, sans toucher à l'original gardé dans la tablette. */
async function photoPourIA(blob: Blob): Promise<PieceBilan> {
  try {
    const img = await createImageBitmap(blob);
    const k = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const jpeg: Blob = await new Promise((ok, ko) => c.toBlob(b => b ? ok(b) : ko(new Error("conversion")), "image/jpeg", 0.85));
    return { type: "image/jpeg", donnees: await base64(jpeg) };
  } catch {
    return { type: blob.type || "image/jpeg", donnees: await base64(blob) };
  }
}

const PAGES_MAX = 12;

/* Chaque page du PDF est dessinée sur la tablette, écriture au stylet comprise (comme dans la visionneuse) :
   selon l'appli de notes, l'écriture est rangée à part dans le PDF et l'IA pourrait ne pas la voir.
   Le texte tapé de la trame est extrait en plus. */
async function pdfPourIA(blob: Blob): Promise<PieceBilan[]> {
  const { pdfjs } = await import("./pdf");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  try { return await pagesPourIA(pdf); }
  finally { pdf.destroy().catch(() => {}); }   // un lecteur par PDF : libéré après usage (audit M10)
}

async function pagesPourIA(pdf: Awaited<ReturnType<typeof import("./pdf")["pdfjs"]["getDocument"]>["promise"]>): Promise<PieceBilan[]> {
  if (pdf.numPages > PAGES_MAX) throw new ErreurIA(`Ce bilan a ${pdf.numPages} pages : l'IA en lit ${PAGES_MAX} au plus.`);
  const pages: PieceBilan[] = [], textes: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, 1600 / Math.max(base.width, base.height)) });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const jpeg: Blob = await new Promise((ok, ko) => c.toBlob(x => x ? ok(x) : ko(new Error("conversion")), "image/jpeg", 0.85));
    pages.push({ type: "image/jpeg", donnees: await base64(jpeg) });
    const t = (await page.getTextContent()).items.map(it => "str" in it ? it.str : "").join(" ").replace(/\s+/g, " ").trim();
    if (t) textes.push(`Page ${i} : ${t}`);
  }
  return textes.length ? [...pages, { type: "text/plain", donnees: textes.join("\n") }] : pages;
}

async function piecesDe(b: Bilan): Promise<PieceBilan[]> {
  const pieces: PieceBilan[] = [];
  for (const f of b.fichiers) {
    const blob = await db.fichierBlob(f.id);
    if (!blob) throw new ErreurIA("Le fichier du bilan est introuvable dans la tablette.");
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.nom)) {
      try { pieces.push(...await pdfPourIA(blob)); }
      catch (e) {
        if (e instanceof ErreurIA) throw e;
        // PDF illisible sur la tablette : on l'envoie tel quel
        if (blob.size > 24e6) throw new ErreurIA("Ce PDF est trop lourd pour l'IA (24 Mo au plus).");
        pieces.push({ type: "application/pdf", donnees: await base64(blob) });
      }
    } else pieces.push(await photoPourIA(blob));
  }
  return pieces;
}

/* ---------- bilans ---------- */

export function resumer(bilanId: string, manuel: boolean) {
  tentes.add(bilanId);   // tenté, même si une autre fenêtre s'en charge : la file automatique passe au suivant
  return seul("bilan:" + bilanId, () => resumerSeul(bilanId, manuel));
}
async function resumerSeul(bilanId: string, manuel: boolean) {
  if (enCours.has(bilanId)) return;
  const ia = await configIA();
  if (!ia) { if (manuel) messages(PAS_REGLE); return; }
  if (!navigator.onLine) { if (manuel) messages("Pas de connexion : le résumé se fera dès que la tablette sera en ligne."); return; }
  enCours.add(bilanId); tentes.add(bilanId); prevenir();
  try {
    const { bilans } = await db.tout();
    const b = bilans.find(x => x.id === bilanId);
    if (!b || b.resume) return;
    /* du plus ancien au plus récent : l'IA reçoit les 60 derniers (audit F7) */
    const parDate = [...bilans].sort((a, b) => String(a.ajoute).localeCompare(String(b.ajoute)));
    const corrections: Correction[] = parDate.flatMap(x => x.corrections).sort((a, b) => String(a.quand).localeCompare(String(b.quand))).map(c => ({ point: c.point, correction: c.correction }));
    const confirmees = parDate.flatMap(x => x.valides);   // points « à vérifier » validés par « C'est juste »
    const r = await resumerBilan(ia.secret, await piecesDe(b), corrections, ia.appel, confirmees);
    await db.majBilan(b.id, { resume: r.donnees, resume_erreur: undefined });
    await db.ajouterConso("bilans", r.usage);
    if (manuel) messages("Bilan résumé.");
  } catch (e) {
    const texte = e instanceof ErreurIA ? e.message : "Le résumé n'a pas abouti.";
    try { await db.majBilan(bilanId, { resume_erreur: texte }); } catch { /* bilan supprimé entre-temps */ }
    if (manuel) messages(texte);
  } finally {
    enCours.delete(bilanId); prevenir();
  }
}

/* Après un changement de réglage de l'IA : tous les bilans sans résumé ont droit à un nouvel essai. */
export function relancerEnAttente() {
  tentes.clear(); seancesTentees.clear();
  return resumerEnAttente();
}

/* Séances jamais analysées (réseau coupé pendant la mise au propre, séance notée hors connexion, serveur qui redémarrait) :
   reprises à l'ouverture et au retour du réseau, une tentative par ouverture, par l'appareil où elles ont été notées
   (pas de double demande à l'IA), sur les 14 derniers jours. Le rendez-vous dicté est posé à cette occasion (audit M3). */
const seancesTentees = new Set<string>();
async function analyserEnAttente() {
  if (!(await configIA()) || !navigator.onLine) return;
  const moi = await db.appareil(), depuis = isoDay(new Date(Date.now() - 14 * 864e5));
  const { seances } = await db.tout();
  for (const s of seances) {
    if (s.ia_ok || s.origine !== moi || s.date < depuis || seancesTentees.has(s.id) || enCours.has(s.id) || relancesSeances.has(s.id)) continue;
    if (Date.now() - new Date(s.cree).getTime() < 60_000) continue;   // tout juste notée : son analyse est déjà partie
    seancesTentees.add(s.id);
    await analyser(s, false, !!s.brut);
  }
}

/* Lance, un par un, le résumé des bilans qui n'en ont pas encore (une seule tentative automatique par ouverture de l'appli). */
let enFile = false;
export async function resumerEnAttente() {
  if (enFile) return;
  enFile = true;
  try {
    if (!(await configIA()) || !navigator.onLine) return;
    const moi = await db.appareil();
    for (;;) {
      const { bilans } = await db.tout();
      /* un bilan déposé sur un autre appareil (reçu du PC) est résumé là-bas : pas de double demande à l'IA ;
         mais s'il y attend depuis plus de 15 minutes sans avoir été tenté (IA pas réglée sur le PC…), cet appareil s'en charge (audit F5) */
      const delaisse = (x: Bilan) => !x.resume_erreur && Date.now() - new Date(x.ajoute).getTime() > 15 * 60_000;
      const b = bilans.find(x => !x.resume && !tentes.has(x.id) && !enCours.has(x.id) && (!x.origine || x.origine === moi || delaisse(x)));
      if (!b) break;
      await resumer(b.id, false);
    }
  } finally { enFile = false; }
  corrigerEnAttente();
  await analyserEnAttente();
}

/* ---------- corrections reportées dans le résumé ---------- */

export const cleCorrection = (bilanId: string) => "corr:" + bilanId;
export const correctionsEnAttente = (b: Bilan) => b.resume ? b.corrections.filter(c => !c.appliquee) : [];

/* Quand Corentin corrige un point « à vérifier », l'IA reporte la correction dans le résumé (date, chiffres, rubriques…). */
export function integrerCorrections(bilanId: string, manuel: boolean) {
  tentes.add(cleCorrection(bilanId));
  return seul("correction:" + bilanId, () => integrerSeul(bilanId, manuel));
}
async function integrerSeul(bilanId: string, manuel: boolean) {
  const id = cleCorrection(bilanId);
  if (enCours.has(id)) return;
  const ia = await configIA();
  if (!ia) { if (manuel) messages(PAS_REGLE); return; }
  if (!navigator.onLine) { if (manuel) messages("Pas de connexion : la correction sera reportée dès que la tablette sera en ligne."); return; }
  const b = (await db.tout()).bilans.find(x => x.id === bilanId);
  const aFaire = b ? correctionsEnAttente(b) : [];
  if (!b?.resume || !aFaire.length) return;
  enCours.add(id); tentes.add(id); prevenir();
  try {
    const r = await corrigerResume(ia.secret, b.resume, aFaire.map(c => ({ point: c.point, correction: c.correction })), ia.appel);
    await db.ajouterConso("seances", r.usage);
    const actuel = (await db.tout()).bilans.find(x => x.id === bilanId);
    if (!actuel?.resume) return;
    const faites = new Set(aFaire.map(c => c.quand + c.point));
    /* les points « à vérifier » ont pu changer pendant ce temps : on garde ceux du moment */
    await db.majBilan(bilanId, {
      resume: { ...r.donnees, a_verifier: actuel.resume.a_verifier ?? [] },
      corrections: actuel.corrections.map(c => faites.has(c.quand + c.point) ? { ...c, appliquee: true } : c),
      correction_erreur: undefined
    });
    if (manuel) messages("Correction reportée dans le résumé.");
  } catch (e) {
    const texte = e instanceof ErreurIA ? e.message : "Le report de la correction n'a pas abouti.";
    try { await db.majBilan(bilanId, { correction_erreur: texte }); } catch { /* bilan supprimé entre-temps */ }
    if (manuel) messages(texte);
  } finally {
    enCours.delete(id); prevenir();
  }
}

/* corrections pas encore reportées (faites hors connexion, ou avant la version 0.6.2) : une tentative par ouverture de l'appli */
let corrEnFile = false;
export async function corrigerEnAttente() {
  if (corrEnFile) return;
  corrEnFile = true;
  try {
    if (!(await configIA()) || !navigator.onLine) return;
    for (;;) {
      const b = (await db.tout()).bilans.find(x => correctionsEnAttente(x).length && !tentes.has(cleCorrection(x.id)) && !enCours.has(cleCorrection(x.id)));
      if (!b) break;
      await integrerCorrections(b.id, false);
    }
  } finally { corrEnFile = false; }
}

/* ---------- séances ---------- */

/* Range le résultat de l'IA dans la séance : mise au propre, « À venir », et rendez-vous dicté.
   Renvoie le message du rendez-vous posé, ou null. */
async function appliquer(se: Seance, a: AnalyseSeance, brut: string): Promise<string | null> {
  const patch: Partial<Seance> = { ia_ok: true };
  // l'empreinte du texte d'origine, pas sa copie : la séance pèse une fois son texte, pas trois (audit A5)
  if (brut && a.resume) { patch.avenir_resume = a.resume; patch.avenir_source = empreinteTexte(brut); }
  if (a.propre) { patch.propre = a.propre; patch.propre_source = empreinteTexte(se.contenu); }
  if (a.bref) { patch.bref = a.bref; patch.bref_source = empreinteTexte(se.contenu); }
  await db.majSeance(se.id, patch);
  /* on ne pose le rendez-vous que s'il est à venir et que cette séance est bien la dernière du patient */
  const { seances, dossiers } = await db.tout();
  const derniere = !seances.some(x => x.dossierId === se.dossierId && x.id !== se.id && x.date > se.date);
  const dossier = dossiers.find(d => d.id === se.dossierId);
  /* « dernière séance », « fin de traitement » dit dans la dictée : fin notée, le dossier est archivé (choix du 8 novembre 2026) */
  if (a.fin && derniere && dossier) {
    await db.finTraitement(dossier.id, se.date);
    return "Fin de traitement notée pour " + dossier.label + " : dossier archivé (« Rouvrir le dossier » sur sa fiche en cas d'erreur).";
  }
  if (!(a.rdvDate && a.rdvDate >= isoDay(new Date()) && derniere && dossier)) return null;
  // matin ou après-midi pas dit : même demi-journée que la séance (choix de Corentin, 5 novembre 2026) ;
  // les rendez-vous passés sont gardés (historique, futures absences)
  const demi = a.rdvDemi || demiSeance(dossier.rdvs, se.date);
  await db.modifierRdvs(dossier.id, rdvs => avecRdv(rdvs, a.rdvDate, a.rdvHeure, undefined, demi));
  return "Rendez-vous repéré pour " + dossier.label + " : " + jourLabel(a.rdvDate, new Date()).toLowerCase() + (demi ? " " + DEMI_FR[demi] : "") + ".";
}

/* Après l'enregistrement d'une séance : mise au propre de la dictée, résumé du « À venir » et,
   si la note le dit, date du prochain rendez-vous. sansPropre = le texte a été corrigé à la main, on n'y retouche pas. */
/* séances dont la mise au propre a échoué : nouvel essai prévu (5 min, 3 essais au plus ; audit M8) */
const relancesSeances = new Map<string, Relanceur>();
async function relancerSeance(id: string, essai: number, sansPropre: boolean) {
  relancesSeances.delete(id);
  const s = (await db.tout()).seances.find(x => x.id === id);
  if (s && !s.ia_ok) await analyser(s, false, sansPropre, essai);
}

export function analyser(se: Seance, manuel: boolean, sansPropre: boolean, essai = 1) {
  return seul("seance:" + se.id, async () => {
    /* une autre fenêtre a pu la mettre au propre entre-temps (elle ne l'était pas quand on nous l'a confiée) */
    if (!manuel && !se.ia_ok) { const s = (await db.tout()).seances.find(x => x.id === se.id); if (!s || (s.ia_ok && s.contenu === se.contenu)) return; }
    await analyserSeul(se, manuel, sansPropre, essai);
  });
}
async function analyserSeul(se: Seance, manuel: boolean, sansPropre: boolean, essai: number) {
  if (enCours.has(se.id)) return;
  relancesSeances.get(se.id)?.annuler(); relancesSeances.delete(se.id);
  const brut = avenirFrom(se.contenu);
  if (sansPropre && !brut && !parleRdv(se.contenu)) return;
  const ia = await configIA();
  if (!ia) { if (manuel) messages(PAS_REGLE); return; }
  if (!navigator.onLine) { if (manuel) messages("Pas de connexion : réessayez une fois en ligne."); return; }
  enCours.add(se.id); prevenir();
  try {
    const { donnees: a, usage } = await analyserSeance(ia.secret, se.date, se.contenu, sansPropre, ia.appel);
    await db.ajouterConso("seances", usage);
    const { seances } = await db.tout();
    const actuelle = seances.find(x => x.id === se.id);
    if (!actuelle || actuelle.contenu !== se.contenu) return;   // séance supprimée ou modifiée pendant l'analyse
    const rdv = await appliquer(se, a, brut);
    if (rdv) messages(rdv);
    else if (manuel) messages(a.propre ? "Séance mise au propre." : a.resume ? "Résumé mis à jour." : "Rien à reformuler dans cette note.");
  } catch (e) {
    const r = new Relanceur(n => { relancerSeance(se.id, n, sansPropre); });
    const p = r.echec(e, essai);
    if (p) relancesSeances.set(se.id, r);
    const suite = p ? (p.quand == null ? " Nouvel essai au retour du réseau." : " Nouvel essai dans 5 minutes.") : "";
    if (manuel || !(e instanceof ErreurIA)) messages((e instanceof ErreurIA ? e.message : "La mise au propre n'a pas abouti.") + (suite || " Réessayez."));
    else messages("Séance enregistrée, mais la mise au propre n'a pas abouti : " + e.message.charAt(0).toLowerCase() + e.message.slice(1) + suite);
  } finally {
    enCours.delete(se.id); prevenir();
  }
}

/* ---------- dictée groupée ---------- */

/* Un passage que l'appli n'a pas pu ranger seule : Corentin choisit le dossier parmi les candidats. */
export type Doute = { id: string; date: string; seance: SeanceDictee; candidats: string[] };
export type Range = { seanceId: string; dossierId: string };

/* Une seule demande à l'IA pour toute la dictée, puis rangement : automatique si un seul dossier convient
   (règle de rattacher), sinon le passage devient un doute. Lève une ErreurIA si rien n'a pu être fait. */
export async function rangerDictee(date: string, texte: string): Promise<{ ranges: Range[]; doutes: Doute[]; rdvs: string[] }> {
  const ia = await configIA();
  if (!ia) throw new ErreurIA(PAS_REGLE);
  if (!navigator.onLine) throw new ErreurIA("Pas de connexion à internet.", "reseau");
  const { dossiers } = await db.tout();
  const patients = dossiers.filter(d => !estArchive(d)).map(d => ({ label: d.label, vuCeJour: d.rdvs.some(r => r.d === date) }));   // les archivés ne sont pas proposés à l'IA
  const { donnees: morceaux, usage } = await decouperDictee(ia.secret, date, texte, patients, ia.appel);
  await db.ajouterConso("seances", usage);
  const ranges: Range[] = [], doutes: Doute[] = [], rdvs: string[] = [];
  for (const m of morceaux) {
    const { dossier, candidats } = rattacher(m.nom, dossiers, date);
    if (!dossier) { doutes.push({ id: crypto.randomUUID(), date, seance: m, candidats: candidats.map(d => d.id) }); continue; }
    const r = await rangerSeance(dossier.id, date, m);
    ranges.push(r.range); if (r.rdv) rdvs.push(r.rdv);
  }
  return { ranges, doutes, rdvs };
}

/* Séance manquante : cherche le patient dans les dictées gardées de ce jour-là. Rend le passage, ou null. */
export async function chercherSeance(dossierId: string, date: string): Promise<string | null> {
  const ia = await configIA();
  if (!ia) throw new ErreurIA(PAS_REGLE);
  if (!navigator.onLine) throw new ErreurIA("Pas de connexion : réessayez une fois en ligne.");
  const dictees = await db.dicteesDu(date);
  if (!dictees.length) throw new ErreurIA("Aucune dictée gardée pour ce jour-là (les dictées sont gardées depuis le 5 novembre 2026).");
  const dossier = (await db.tout()).dossiers.find(d => d.id === dossierId);
  if (!dossier) throw new ErreurIA("Patient introuvable.");
  const { donnees, usage } = await chercherDansDictee(ia.secret, dictees.map(x => x.texte).join("\n\n"), dossier.label, ia.appel);
  await db.ajouterConso("seances", usage);
  return donnees;
}

/* le passage retrouvé devient une séance normale, mise au propre comme les autres */
export async function rangerPassage(dossierId: string, date: string, extrait: string) {
  const se = await db.ajouterSeance(dossierId, date, extrait);
  analyser(se, false, false);
}

/* enregistre un passage de la dictée comme une séance normale du dossier choisi */
export async function rangerSeance(dossierId: string, date: string, m: SeanceDictee): Promise<{ range: Range; rdv: string | null }> {
  const se = await db.ajouterSeance(dossierId, date, m.contenu);
  const rdv = await appliquer(se, m, avenirFrom(m.contenu));
  return { range: { seanceId: se.id, dossierId }, rdv };
}
