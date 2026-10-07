/* Travail de l'IA en arrière-plan : résumé automatique des bilans déposés,
   analyse des séances enregistrées. Rien n'est envoyé sans clé, ni sans connexion. */
import * as db from "./db";
import { analyserSeance, appelerAbonnement, appelerClaude, ErreurIA, resumerBilan, parleRdv, type Appel, type Correction, type PieceBilan } from "./ia";
import { avecRdv, avenirFrom, isoDay, jourLabel, heureFr, rdvsAVenir, type Bilan, type Seance } from "./regles";

const enCours = new Set<string>();      // identifiants des bilans et séances en cours de traitement
const tentes = new Set<string>();       // bilans déjà tentés automatiquement depuis l'ouverture de l'appli
const abonnes = new Set<() => void>();

export const occupe = (id: string) => enCours.has(id);
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

async function piecesDe(b: Bilan): Promise<PieceBilan[]> {
  const pieces: PieceBilan[] = [];
  for (const f of b.fichiers) {
    const blob = await db.fichierBlob(f.id);
    if (!blob) throw new ErreurIA("Le fichier du bilan est introuvable dans la tablette.");
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.nom)) {
      if (blob.size > 24e6) throw new ErreurIA("Ce PDF est trop lourd pour l'IA (24 Mo au plus).");
      pieces.push({ type: "application/pdf", donnees: await base64(blob) });
    } else pieces.push(await photoPourIA(blob));
  }
  return pieces;
}

/* ---------- bilans ---------- */

export async function resumer(bilanId: string, manuel: boolean) {
  if (enCours.has(bilanId)) return;
  const ia = await configIA();
  if (!ia) { if (manuel) messages(PAS_REGLE); return; }
  if (!navigator.onLine) { if (manuel) messages("Pas de connexion : le résumé se fera dès que la tablette sera en ligne."); return; }
  enCours.add(bilanId); tentes.add(bilanId); prevenir();
  try {
    const { bilans } = await db.tout();
    const b = bilans.find(x => x.id === bilanId);
    if (!b || b.resume) return;
    const corrections: Correction[] = bilans.flatMap(x => x.corrections.map(c => ({ point: c.point, correction: c.correction })));
    const r = await resumerBilan(ia.secret, await piecesDe(b), corrections, ia.appel);
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

/* Lance, un par un, le résumé des bilans qui n'en ont pas encore (une seule tentative automatique par ouverture de l'appli). */
let enFile = false;
export async function resumerEnAttente() {
  if (enFile) return;
  enFile = true;
  try {
    if (!(await configIA()) || !navigator.onLine) return;
    for (;;) {
      const { bilans } = await db.tout();
      const b = bilans.find(x => !x.resume && !tentes.has(x.id) && !enCours.has(x.id));
      if (!b) break;
      await resumer(b.id, false);
    }
  } finally { enFile = false; }
}

/* ---------- séances ---------- */

/* Après l'enregistrement d'une séance : mise au propre de la dictée, résumé du « À venir » et,
   si la note le dit, date du prochain rendez-vous. sansPropre = le texte a été corrigé à la main, on n'y retouche pas. */
export async function analyser(se: Seance, manuel: boolean, sansPropre: boolean) {
  if (enCours.has(se.id)) return;
  const brut = avenirFrom(se.contenu);
  if (sansPropre && !brut && !parleRdv(se.contenu)) return;
  const ia = await configIA();
  if (!ia) { if (manuel) messages(PAS_REGLE); return; }
  if (!navigator.onLine) { if (manuel) messages("Pas de connexion : réessayez une fois en ligne."); return; }
  enCours.add(se.id); prevenir();
  try {
    const { donnees: a, usage } = await analyserSeance(ia.secret, se.date, se.contenu, sansPropre, ia.appel);
    await db.ajouterConso("seances", usage);
    const { seances, dossiers } = await db.tout();
    const actuelle = seances.find(x => x.id === se.id);
    if (!actuelle || actuelle.contenu !== se.contenu) return;   // séance supprimée ou modifiée pendant l'analyse
    const patch: Partial<Seance> = { ia_ok: true };
    if (brut && a.resume) { patch.avenir_resume = a.resume; patch.avenir_source = brut; }
    if (a.propre) { patch.propre = a.propre; patch.propre_source = se.contenu; }
    await db.majSeance(se.id, patch);
    /* on ne pose le rendez-vous que s'il est à venir et que cette séance est bien la dernière du patient */
    const derniere = !seances.some(x => x.dossierId === se.dossierId && x.id !== se.id && x.date > se.date);
    const dossier = dossiers.find(d => d.id === se.dossierId);
    if (a.rdvDate && a.rdvDate >= isoDay(new Date()) && derniere && dossier) {
      await db.setRdvs(dossier.id, avecRdv(rdvsAVenir(dossier.rdvs, isoDay(new Date())), a.rdvDate, a.rdvHeure));
      messages("Rendez-vous repéré : " + jourLabel(a.rdvDate, new Date()).toLowerCase() + (a.rdvHeure ? " à " + heureFr(a.rdvHeure) : "") + ".");
    } else if (manuel) messages(a.propre ? "Séance mise au propre." : a.resume ? "Résumé mis à jour." : "Rien à reformuler dans cette note.");
  } catch (e) {
    if (manuel || !(e instanceof ErreurIA)) messages(e instanceof ErreurIA ? e.message : "La mise au propre n'a pas abouti. Réessayez.");
    else messages("Séance enregistrée, mais la mise au propre n'a pas abouti : " + e.message.charAt(0).toLowerCase() + e.message.slice(1));
  } finally {
    enCours.delete(se.id); prevenir();
  }
}
