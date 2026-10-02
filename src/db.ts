/* Rangement des données dans la tablette (IndexedDB). Rien ne part sur internet.
   Remplace les briques db et assets de claude.ai utilisées par la version d'essai. */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { avecRdv, patientFrom, type Bilan, type Dossier, type FichierBilan, type Rdv, type Seance } from "./regles";

interface Schema extends DBSchema {
  dossiers: { key: string; value: Dossier };
  bilans: { key: string; value: Bilan; indexes: { dossierId: string } };
  seances: { key: string; value: Seance; indexes: { dossierId: string } };
  fichiers: { key: string; value: { id: string; blob: Blob } };
}

export type Donnees = { dossiers: Dossier[]; bilans: Bilan[]; seances: Seance[] };

let base: Promise<IDBPDatabase<Schema>> | null = null;
const ouvrir = () => base ??= openDB<Schema>("mes-patients", 1, {
  upgrade(db) {
    db.createObjectStore("dossiers", { keyPath: "id" });
    db.createObjectStore("bilans", { keyPath: "id" }).createIndex("dossierId", "dossierId");
    db.createObjectStore("seances", { keyPath: "id" }).createIndex("dossierId", "dossierId");
    db.createObjectStore("fichiers", { keyPath: "id" });
  }
});

/* pour les tests : repartir d'une base neuve */
export async function fermer() { if (base) (await base).close(); base = null; }

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
  const db = await ouvrir();
  const b = await db.get("bilans", id);
  if (!b) throw new Error("Bilan introuvable");
  await db.put("bilans", { ...b, ...patch, id });
  prevenir();
}

/* Supprime un bilan et ses fichiers. Si c'était le dernier bilan du dossier, le dossier part avec ses séances et rendez-vous. */
export async function supprimerBilan(id: string) {
  const db = await ouvrir();
  const tx = db.transaction(["dossiers", "bilans", "seances", "fichiers"], "readwrite");
  const b = await tx.objectStore("bilans").get(id);
  if (b) {
    for (const f of b.fichiers) await tx.objectStore("fichiers").delete(f.id);
    await tx.objectStore("bilans").delete(id);
    const restants = await tx.objectStore("bilans").index("dossierId").getAllKeys(b.dossierId);
    if (!restants.length) {
      for (const k of await tx.objectStore("seances").index("dossierId").getAllKeys(b.dossierId)) await tx.objectStore("seances").delete(k);
      await tx.objectStore("dossiers").delete(b.dossierId);
    }
  }
  await tx.done;
  prevenir();
}

/* ---------- dossiers ---------- */

export async function setRdvs(dossierId: string, rdvs: Rdv[]) {
  const db = await ouvrir();
  const d = await db.get("dossiers", dossierId);
  if (!d) throw new Error("Dossier introuvable");
  await db.put("dossiers", { ...d, rdvs });
  prevenir();
}

/* « Oui, même personne » : le dossier en attente rejoint l'autre (bilans, séances, rendez-vous). */
export async function fusionner(depuisId: string, versId: string) {
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
  const db = await ouvrir();
  const d = await db.get("dossiers", dossierId);
  if (!d) throw new Error("Dossier introuvable");
  await db.put("dossiers", { ...d, label, homonyme: false });
  prevenir();
}

/* ---------- séances ---------- */

export async function ajouterSeance(dossierId: string, date: string, contenu: string): Promise<Seance> {
  const s: Seance = { id: nouvelId(), dossierId, date, contenu, cree: new Date().toISOString() };
  await (await ouvrir()).put("seances", s);
  prevenir();
  return s;
}

export async function majSeance(id: string, patch: Partial<Seance>) {
  const db = await ouvrir();
  const s = await db.get("seances", id);
  if (!s) throw new Error("Séance introuvable");
  await db.put("seances", { ...s, ...patch, id });
  prevenir();
}

export async function supprimerSeance(id: string) {
  await (await ouvrir()).delete("seances", id);
  prevenir();
}
