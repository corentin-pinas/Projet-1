/* Rangement des données dans la tablette (IndexedDB). Rien ne part sur internet.
   Remplace les briques db et assets de claude.ai utilisées par la version d'essai. */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { avecRdv, isoDay, patientFrom, type Bilan, type Dossier, type FichierBilan, type Rdv, type Seance } from "./regles";

interface Schema extends DBSchema {
  dossiers: { key: string; value: Dossier };
  bilans: { key: string; value: Bilan; indexes: { dossierId: string } };
  seances: { key: string; value: Seance; indexes: { dossierId: string } };
  fichiers: { key: string; value: { id: string; blob: Blob } };
  parametres: { key: string; value: { cle: string; valeur: unknown } };
  copies: { key: string; value: Copie };
}

/* entree, sortie : jetons de la clé API ; facture : dollars facturés sur la clé API ; indicatif : coût annoncé par Claude Code sur l'abonnement (non facturé, c'est le quota) */
export type Conso = { mois: string; bilans: number; seances: number; entree: number; sortie: number; facture?: number; indicatif?: number };

export type Donnees = { dossiers: Dossier[]; bilans: Bilan[]; seances: Seance[] };

/* Copie de sécurité interne : le texte de la base (sans les réglages). Les PDF et photos ne sont pas recopiés :
   un fichier reste gardé tant qu'un bilan ou une copie y renvoie.
   id : le jour (AAAA-MM-JJ) pour la copie quotidienne, AVANT_RETOUR pour l'état gardé avant un retour en arrière. */
export type Copie = { id: string; cree: string; donnees: Donnees; taille: number };
export const AVANT_RETOUR = "avant-retour";
export const COPIES_GARDEES = 7;

let base: Promise<IDBPDatabase<Schema>> | null = null;
const ouvrir = () => base ??= openDB<Schema>("mes-patients", 3, {
  upgrade(db, ancienne) {
    if (ancienne < 1) {
      db.createObjectStore("dossiers", { keyPath: "id" });
      db.createObjectStore("bilans", { keyPath: "id" }).createIndex("dossierId", "dossierId");
      db.createObjectStore("seances", { keyPath: "id" }).createIndex("dossierId", "dossierId");
      db.createObjectStore("fichiers", { keyPath: "id" });
    }
    if (ancienne < 2) db.createObjectStore("parametres", { keyPath: "cle" });   // version 0.3 : clé de l'IA, consommation
    if (ancienne < 3) db.createObjectStore("copies", { keyPath: "id" });        // version 0.5 : copies de sécurité
  }
});

/* pour les tests : repartir d'une base neuve */
export async function fermer() { if (base) (await base).close(); base = null; jourCopie = null; }

const nouvelId = () => crypto.randomUUID();

/* ---------- prévenir l'écran à chaque changement (remplace onSnapshot) ---------- */
const abonnes = new Set<() => void>();
export function abonner(fn: () => void) { abonnes.add(fn); return () => abonnes.delete(fn); }
const prevenir = () => abonnes.forEach(fn => fn());

export async function tout(): Promise<Donnees> {
  const db = await ouvrir();
  const [dossiers, bilans, seances] = await Promise.all([db.getAll("dossiers"), db.getAll("bilans"), db.getAll("seances")]);
  return { dossiers, bilans, seances };
}

export async function fichierBlob(id: string): Promise<Blob | null> {
  return (await (await ouvrir()).get("fichiers", id))?.blob ?? null;
}

/* ---------- bilans ---------- */

/* Un groupe de fichiers = un bilan (un PDF seul, ou plusieurs photos choisies ensemble).
   Si un dossier porte déjà ce nom, le bilan va dans un nouveau dossier marqué « homonyme » :
   la question « même personne ? » sera posée une fois le bilan résumé. */
export async function ajouterBilan(fichiers: File[]): Promise<Bilan> {
  await copieDuJour();
  const db = await ouvrir();
  const nom = fichiers[0].name.replace(/\.[^.]+$/, "");
  const label = patientFrom(fichiers[0].name);
  const existants = await db.getAll("dossiers");
  const dossier: Dossier = { id: nouvelId(), label, rdvs: [], homonyme: existants.some(d => d.label === label), cree: new Date().toISOString() };
  const refs: FichierBilan[] = fichiers.map(f => ({ id: nouvelId(), nom: f.name, type: f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "") }));
  const bilan: Bilan = { id: nouvelId(), dossierId: dossier.id, fichier: nom, fichiers: refs, ajoute: new Date().toISOString(), resume: null, valides: [], corrections: [] };
  const tx = db.transaction(["dossiers", "bilans", "fichiers"], "readwrite");
  await Promise.all([
    ...fichiers.map((f, i) => tx.objectStore("fichiers").put({ id: refs[i].id, blob: f })),
    tx.objectStore("dossiers").put(dossier),
    tx.objectStore("bilans").put(bilan),
    tx.done
  ]);
  prevenir();
  return bilan;
}

export async function majBilan(id: string, patch: Partial<Bilan>) {
  await copieDuJour();
  const db = await ouvrir();
  const b = await db.get("bilans", id);
  if (!b) throw new Error("Bilan introuvable");
  await db.put("bilans", { ...b, ...patch, id });
  prevenir();
}

/* Supprime un bilan et ses fichiers. Si c'était le dernier bilan du dossier, le dossier part avec ses séances et rendez-vous. */
export async function supprimerBilan(id: string) {
  await copieDuJour();
  const db = await ouvrir();
  const tx = db.transaction(["dossiers", "bilans", "seances", "fichiers"], "readwrite");
  const b = await tx.objectStore("bilans").get(id);
  if (b) {
    await tx.objectStore("bilans").delete(id);
    const restants = await tx.objectStore("bilans").index("dossierId").getAllKeys(b.dossierId);
    if (!restants.length) {
      for (const k of await tx.objectStore("seances").index("dossierId").getAllKeys(b.dossierId)) await tx.objectStore("seances").delete(k);
      await tx.objectStore("dossiers").delete(b.dossierId);
    }
  }
  await tx.done;
  await nettoyerFichiers();   // les fichiers du bilan partent, sauf si une copie y renvoie encore
  prevenir();
}

/* ---------- dossiers ---------- */

export async function setRdvs(dossierId: string, rdvs: Rdv[]) {
  await copieDuJour();
  const db = await ouvrir();
  const d = await db.get("dossiers", dossierId);
  if (!d) throw new Error("Dossier introuvable");
  await db.put("dossiers", { ...d, rdvs });
  prevenir();
}

/* « Oui, même personne » : le dossier en attente rejoint l'autre (bilans, séances, rendez-vous). */
export async function fusionner(depuisId: string, versId: string) {
  await copieDuJour();
  const db = await ouvrir();
  const tx = db.transaction(["dossiers", "bilans", "seances"], "readwrite");
  const [depuis, vers] = await Promise.all([tx.objectStore("dossiers").get(depuisId), tx.objectStore("dossiers").get(versId)]);
  if (!depuis || !vers) throw new Error("Dossier introuvable");
  for (const b of await tx.objectStore("bilans").index("dossierId").getAll(depuisId)) await tx.objectStore("bilans").put({ ...b, dossierId: versId });
  for (const s of await tx.objectStore("seances").index("dossierId").getAll(depuisId)) await tx.objectStore("seances").put({ ...s, dossierId: versId });
  const rdvs = depuis.rdvs.reduce((l, r) => l.some(x => x.d === r.d) ? l : avecRdv(l, r.d, r.h), vers.rdvs);
  await tx.objectStore("dossiers").put({ ...vers, rdvs });
  await tx.objectStore("dossiers").delete(depuisId);
  await tx.done;
  prevenir();
}

/* « Non, deux personnes différentes » : le dossier en attente prend un nouveau nom (« Sylvie Fr. »). */
export async function renommer(dossierId: string, label: string) {
  await copieDuJour();
  const db = await ouvrir();
  const d = await db.get("dossiers", dossierId);
  if (!d) throw new Error("Dossier introuvable");
  await db.put("dossiers", { ...d, label, homonyme: false });
  prevenir();
}

/* ---------- séances ---------- */

export async function ajouterSeance(dossierId: string, date: string, contenu: string): Promise<Seance> {
  await copieDuJour();
  const s: Seance = { id: nouvelId(), dossierId, date, contenu, cree: new Date().toISOString() };
  await (await ouvrir()).put("seances", s);
  prevenir();
  return s;
}

export async function majSeance(id: string, patch: Partial<Seance>) {
  await copieDuJour();
  const db = await ouvrir();
  const s = await db.get("seances", id);
  if (!s) throw new Error("Séance introuvable");
  await db.put("seances", { ...s, ...patch, id });
  prevenir();
}

export async function supprimerSeance(id: string) {
  await copieDuJour();
  await (await ouvrir()).delete("seances", id);
  prevenir();
}

/* ---------- copies de sécurité ---------- */

let jourCopie: string | null = null;     // jour de la dernière copie faite ou vérifiée : évite de relire la base à chaque écriture

/* Une copie par jour, faite avant le premier changement de la journée (ou à l'ouverture de l'appli) :
   elle garde donc l'état de la veille au soir. Les plus anciennes au-delà de 7 s'effacent. */
export async function copieDuJour(jour = isoDay(new Date())): Promise<boolean> {
  if (jourCopie === jour) return false;
  const db = await ouvrir();
  if (await db.getKey("copies", jour)) { jourCopie = jour; return false; }
  const donnees = await tout();
  jourCopie = jour;
  if (!donnees.dossiers.length && !donnees.seances.length) return false;   // rien à garder
  await db.put("copies", { id: jour, cree: new Date().toISOString(), donnees, taille: JSON.stringify(donnees).length });
  const jours = (await db.getAllKeys("copies")).filter(k => k !== AVANT_RETOUR).sort().reverse();
  for (const k of jours.slice(COPIES_GARDEES)) await db.delete("copies", k);
  await nettoyerFichiers();
  return true;
}

/* les copies, la plus récente d'abord (celle d'avant un retour en arrière en tête) */
export async function listeCopies(): Promise<Copie[]> {
  const copies = await (await ouvrir()).getAll("copies");
  return copies.sort((a, b) => a.id === AVANT_RETOUR ? -1 : b.id === AVANT_RETOUR ? 1 : b.id.localeCompare(a.id));
}

/* Remet la base dans l'état d'une copie. L'état actuel est d'abord gardé (AVANT_RETOUR) : le retour peut être annulé. */
export async function revenirA(id: string) {
  const copie = await (await ouvrir()).get("copies", id);
  if (!copie) throw new Error("Copie introuvable");
  await remplacer(copie.donnees, [], id !== AVANT_RETOUR);
}

/* Remplace dossiers, bilans et séances (les fichiers donnés sont ajoutés). garderActuel : l'état actuel devient AVANT_RETOUR ;
   sinon (annulation d'un retour) la copie AVANT_RETOUR a servi et disparaît. */
async function remplacer(donnees: Donnees, fichiers: { id: string; blob: Blob }[], garderActuel: boolean) {
  const db = await ouvrir();
  const actuel = await tout();
  const tx = db.transaction(["dossiers", "bilans", "seances", "copies", "fichiers"], "readwrite");
  if (garderActuel) await tx.objectStore("copies").put({ id: AVANT_RETOUR, cree: new Date().toISOString(), donnees: actuel, taille: JSON.stringify(actuel).length });
  else await tx.objectStore("copies").delete(AVANT_RETOUR);
  for (const f of fichiers) await tx.objectStore("fichiers").put(f);
  for (const nom of ["dossiers", "bilans", "seances"] as const) await tx.objectStore(nom).clear();
  for (const d of donnees.dossiers) await tx.objectStore("dossiers").put(d);
  for (const b of donnees.bilans) await tx.objectStore("bilans").put(b);
  for (const s of donnees.seances) await tx.objectStore("seances").put(s);
  await tx.done;
  await nettoyerFichiers();
  prevenir();
}

/* ---------- copie hors de Chrome (fichier complet) ---------- */

export type Export = { donnees: Donnees; fichiers: { id: string; blob: Blob }[] };

/* tout ce qu'il faut pour reconstruire l'appli ailleurs : le texte et les fichiers des bilans actuels (pas les réglages) */
export async function exporter(): Promise<Export> {
  const db = await ouvrir();
  const donnees = await tout();
  const fichiers: Export["fichiers"] = [];
  for (const b of donnees.bilans) for (const f of b.fichiers) {
    const blob = (await db.get("fichiers", f.id))?.blob;
    if (blob) fichiers.push({ id: f.id, blob });
  }
  return { donnees, fichiers };
}

/* restauration depuis le fichier : l'état actuel est gardé, « Annuler le retour en arrière » le remet */
export async function importer(e: Export) {
  await remplacer(e.donnees, e.fichiers, true);
}

/* Efface les PDF et photos auxquels plus aucun bilan ni aucune copie ne renvoie. */
async function nettoyerFichiers() {
  const db = await ouvrir();
  const tx = db.transaction(["bilans", "copies", "fichiers"], "readwrite");
  const gardes = new Set<string>();
  const garder = (bilans: Bilan[]) => bilans.forEach(b => b.fichiers.forEach(f => gardes.add(f.id)));
  garder(await tx.objectStore("bilans").getAll());
  (await tx.objectStore("copies").getAll()).forEach(c => garder(c.donnees.bilans));
  for (const k of await tx.objectStore("fichiers").getAllKeys()) if (!gardes.has(k)) await tx.objectStore("fichiers").delete(k);
  await tx.done;
}

/* ---------- réglages ---------- */

export async function lireParametre<T>(cle: string): Promise<T | undefined> {
  return (await (await ouvrir()).get("parametres", cle))?.valeur as T | undefined;
}

export async function ecrireParametre(cle: string, valeur: unknown) {
  const db = await ouvrir();
  if (valeur === undefined) await db.delete("parametres", cle);
  else await db.put("parametres", { cle, valeur });
}

const moisCourant = () => new Date().toISOString().slice(0, 7);

/* consommation de l'IA du mois en cours (jetons d'entrée et de sortie) */
export async function consoDuMois(): Promise<Conso> {
  const c = await lireParametre<Conso>("conso");
  return c && c.mois === moisCourant() ? c : { mois: moisCourant(), bilans: 0, seances: 0, entree: 0, sortie: 0 };
}

export async function ajouterConso(type: "bilans" | "seances", usage: { entree: number; sortie: number; cout?: number; coutIndicatif?: number }) {
  const c = await consoDuMois();
  await ecrireParametre("conso", {
    ...c, [type]: c[type] + 1, entree: c.entree + usage.entree, sortie: c.sortie + usage.sortie,
    facture: (c.facture ?? 0) + (usage.cout ?? 0),
    indicatif: (c.indicatif ?? 0) + (usage.coutIndicatif ?? 0)
  });
}
