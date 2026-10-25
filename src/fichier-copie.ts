/* Fichier « copie hors de Chrome » : toutes les données (texte et fichiers des bilans), chiffrées par un mot de passe.
   Chiffrement AES-GCM 256, clé tirée du mot de passe par PBKDF2 (SHA-256). Chaque morceau (le texte, puis chaque fichier)
   est chiffré à part, ce qui évite de tenir des centaines de Mo d'un bloc en mémoire.
   Format : « MPSV1 », sel (16 octets), itérations (4 octets), puis pour chaque morceau : longueur (4 octets), iv (12 octets), chiffré.
   Le numéro du morceau est authentifié avec lui : un morceau déplacé ou une copie tronquée est refusé. */

const MAGIE = new TextEncoder().encode("MPSV1");
const ITERATIONS = 600_000;

export type Contenu<E> = { entete: E; fichiers: Blob[] };

export class ErreurCopie extends Error {
  constructor(readonly raison: "format" | "mot-de-passe" | "abimee") { super(raison); }
}

const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const lireU32 = (b: Uint8Array, i = 0) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(i);

async function cle(mdp: string, sel: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(mdp), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sel, iterations, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function chiffrer<E>(contenu: Contenu<E>, mdp: string, iterations = ITERATIONS): Promise<Blob> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const k = await cle(mdp, sel, iterations);
  const parts: BlobPart[] = [MAGIE, sel, u32(iterations)];
  const morceaux: (() => Promise<ArrayBuffer>)[] = [
    async () => new TextEncoder().encode(JSON.stringify({ entete: contenu.entete, nbFichiers: contenu.fichiers.length })).buffer as ArrayBuffer,
    ...contenu.fichiers.map(f => () => f.arrayBuffer())
  ];
  for (let i = 0; i < morceaux.length; i++) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: u32(i) }, k, await morceaux[i]()));
    parts.push(u32(iv.length + ct.length), iv, ct);
  }
  return new Blob(parts, { type: "application/octet-stream" });
}

export async function dechiffrer<E>(fichier: Blob, mdp: string): Promise<Contenu<E>> {
  const lire = async (debut: number, n: number) => new Uint8Array(await fichier.slice(debut, debut + n).arrayBuffer());
  const tete = await lire(0, MAGIE.length + 20);
  if (tete.length < MAGIE.length + 20 || MAGIE.some((o, i) => tete[i] !== o)) throw new ErreurCopie("format");
  const k = await cle(mdp, tete.slice(MAGIE.length, MAGIE.length + 16), lireU32(tete, MAGIE.length + 16));
  let pos = tete.length;
  const morceau = async (i: number) => {
    if (pos + 4 > fichier.size) throw new ErreurCopie("abimee");
    const n = lireU32(await lire(pos, 4));
    const b = await lire(pos + 4, n);
    if (b.length !== n || n < 12) throw new ErreurCopie("abimee");
    pos += 4 + n;
    try { return await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12), additionalData: u32(i) }, k, b.slice(12)); }
    catch { throw new ErreurCopie(i === 0 ? "mot-de-passe" : "abimee"); }
  };
  let tetiere: { entete: E; nbFichiers: number };
  try { tetiere = JSON.parse(new TextDecoder().decode(await morceau(0))); }
  catch (e) { throw e instanceof ErreurCopie ? e : new ErreurCopie("abimee"); }
  const fichiers: Blob[] = [];
  for (let i = 1; i <= tetiere.nbFichiers; i++) fichiers.push(new Blob([await morceau(i)]));
  if (pos !== fichier.size) throw new ErreurCopie("abimee");
  return { entete: tetiere.entete, fichiers };
}
