// Lanceur de Muninn sur le PC (1.7.0, choix de Corentin du 11 novembre 2026) : la seule chose que Windows démarre.
// Il fait tourner le partage (muninn-pc.mjs) et Whisper (voix.py), les relance s'ils s'arrêtent, et met le PC à jour tout
// seul : au démarrage puis toutes les 6 heures, il demande au serveur de Muninn (adresse notée par l'installation dans
// maj.json) s'il existe une version plus récente de ces deux fichiers. Si oui : téléchargement, contrôle (bon numéro,
// programme lisible), ancienne version gardée à côté (.ancien), redémarrage, puis vérification qu'il répond ; sinon
// retour automatique à l'ancienne version, et cette version n'est plus réessayée.
// Les données (donnees.json, fichiers/, copies/, code.txt) ne sont jamais touchées. Ce qui demande des droits
// d'administrateur (Python, droits du dossier, tâche Windows, ce lanceur lui-même) attend que Corentin relance la ligne
// d'installation : maj-etat.json le dit (« relancer »), et l'appli l'affiche dans « État de l'appli ».
// Depuis le lanceur 2 (1.9.0) : aussi travail.mjs, le travail en tâche de fond, chargé par muninn-pc.mjs (pas un
// programme à part) : après sa mise à jour, le partage est redémarré et doit annoncer la nouvelle version (/sante).
// Programme Node sans dépendance.
import { spawn, spawnSync } from "node:child_process";
import { copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export const LANCEUR = 2;
const ici = dirname(fileURLToPath(import.meta.url));
const dossier = process.env.MUNINN_DOSSIER || (process.platform === "win32" ? join(process.env.ProgramData || "C:\\ProgramData", "Muninn") : join(homedir(), ".muninn"));
const port = Number(process.env.MUNINN_PORT) || 4747;
const portVoix = Number(process.env.MUNINN_WHISPER_PORT) || 4748;
const PREMIERE = Number(process.env.MUNINN_MAJ_PREMIERE ?? 120_000);           // première vérification, 2 min après le démarrage
const INTERVALLE = Number(process.env.MUNINN_MAJ_INTERVALLE ?? 6 * 3600_000);   // puis toutes les 6 heures
const SANTE_MS = Number(process.env.MUNINN_MAJ_SANTE ?? 90_000);                 // délai pour répondre après une mise à jour
const fMaj = join(dossier, "maj.json"), fEtat = join(dossier, "maj-etat.json");
const python = process.env.MUNINN_PYTHON || join(dossier, "voix-env", "Scripts", "python.exe");

const noter = t => console.log(new Date().toISOString() + " [lanceur] " + t);
const attendre = ms => new Promise(r => setTimeout(r, ms));
export const versionDe = texte => Number(/\bVERSION\s*=\s*(\d+)/.exec(texte)?.[1] ?? 0);
const lireJson = async (f, defaut) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return defaut; } };
const repond = async (url, delai = 3_000) => { try { return (await fetch(url, { signal: AbortSignal.timeout(delai) })).ok; } catch { return false; } };

/* ---------- les deux programmes ---------- */

const versionsSante = async () => { try { return await (await fetch(`http://127.0.0.1:${port}/sante`, { signal: AbortSignal.timeout(3_000) })).json(); } catch { return null; } };
const programmes = {
  pc: { fichier: join(ici, "muninn-pc.mjs"), commande: process.execPath, sante: () => repond(`http://127.0.0.1:${port}/`),
    lisible: f => spawnSync(process.execPath, ["--check", f]).status === 0 },
  /* un module de muninn-pc.mjs : c'est le partage qu'on redémarre ; il doit répondre avec la nouvelle version */
  travail: { fichier: join(ici, "travail.mjs"), module: "pc", sante: async v => (await versionsSante())?.travail === v,
    lisible: f => spawnSync(process.execPath, ["--check", f]).status === 0 },
  voix: { fichier: join(ici, "voix.py"), commande: python, sante: () => repond(`http://127.0.0.1:${portVoix}/etat`),
    lisible: f => spawnSync(python, ["-I", "-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", f]).status === 0 }
};
const present = nom => existsSync(programmes[nom].fichier) && (programmes[nom].module ? present(programmes[nom].module) : existsSync(programmes[nom].commande));
const enCours = {};      // nom -> processus
const voulus = new Set();

function demarrer(nom) {
  const p = programmes[nom];
  voulus.add(nom);
  const proc = spawn(p.commande, [p.fichier], { cwd: dossier, stdio: "inherit", env: process.env, windowsHide: true });
  enCours[nom] = proc;
  const debut = Date.now();
  proc.on("exit", code => {
    if (enCours[nom] !== proc) return;
    delete enCours[nom];
    if (!voulus.has(nom)) return;
    // arrêt imprévu : relancé, plus lentement s'il s'arrête aussitôt à chaque fois
    const vite = Date.now() - debut < 30_000;
    p.attente = vite ? Math.min((p.attente || 2_000) * 2, 60_000) : 2_000;
    noter(`${nom} s'est arrêté (code ${code}) : relancé dans ${Math.round(p.attente / 1000)} s.`);
    setTimeout(() => { if (voulus.has(nom) && !enCours[nom]) demarrer(nom); }, p.attente).unref?.();
  });
}

function arreter(nom) {
  voulus.delete(nom);
  const proc = enCours[nom];
  if (!proc) return Promise.resolve();
  return new Promise(r => {
    const fin = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* déjà parti */ } }, 10_000);
    proc.once("exit", () => { clearTimeout(fin); r(); });
    proc.kill("SIGTERM");
  });
}

async function repondDans(nom, ms, version) {
  const proc = programmes[nom].module ?? nom;
  for (const fin = Date.now() + ms; Date.now() < fin;) {
    if (await programmes[nom].sante(version)) return true;
    if (!enCours[proc]) return false;
    await attendre(1_000);
  }
  return false;
}

/* Whisper en pleine transcription : on attend (30 minutes au plus) */
async function libre() {
  for (let i = 0; i < 180; i++) {
    try {
      const e = await (await fetch(`http://127.0.0.1:${portVoix}/etat`, { signal: AbortSignal.timeout(3_000) })).json();
      if (!e.occupe) return;
    } catch { return; }
    await attendre(10_000);
  }
}

/* ---------- la mise à jour ---------- */

async function mettreAJour(nom, version, adresse, etat) {
  // le fichier reçu garde son extension (.mjs) : sinon Node le lirait comme un ancien script et le croirait illisible
  const p = programmes[nom], nouveau = p.fichier.replace(/(\.\w+)$/, ".nouveau$1"), ancien = p.fichier + ".ancien";
  const r = await fetch(`${adresse}/pc/${basename(p.fichier)}`, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
  const texte = await r.text();
  if (versionDe(texte) !== version) throw new Error(`fichier reçu en version ${versionDe(texte)} au lieu de ${version}`);
  await writeFile(nouveau, texte);
  if (!p.lisible(nouveau)) throw new Error("fichier reçu illisible");
  if (nom === "voix") await libre();
  const existait = existsSync(p.fichier);   // un module absent (travail.mjs avant sa première installation) est ajouté
  const avant = existait ? versionDe(await readFile(p.fichier, "utf8")) : 0;
  const proc = p.module ?? nom;   // le programme à redémarrer
  if (existait) await copyFile(p.fichier, ancien);
  await arreter(proc);
  await rename(nouveau, p.fichier);
  demarrer(proc);
  if (await repondDans(nom, SANTE_MS, version)) {
    etat.faites = [{ nom, de: avant, a: version, quand: new Date().toISOString() }, ...(etat.faites ?? [])].slice(0, 10);
    noter(`${nom} mis à jour : version ${avant} → ${version}.`);
    return;
  }
  // la nouvelle version ne répond pas : retour à l'ancienne, et cette version ne sera plus réessayée
  await arreter(proc);
  if (existait) await copyFile(ancien, p.fichier); else await rm(p.fichier, { force: true });
  demarrer(proc);
  etat.refusees = { ...(etat.refusees ?? {}), [nom]: version };
  throw new Error(`la version ${version} ne répondait pas : retour à la version ${avant}`);
}

let verification = null;
export function verifier() {
  verification ??= (async () => {
    try { await uneVerification(); } finally { verification = null; }
  })();
  return verification;
}

async function uneVerification() {
  const maj = await lireJson(fMaj, {});
  const etat = await lireJson(fEtat, {});
  etat.verifie = new Date().toISOString();
  delete etat.erreur;
  try {
    if (!maj.adresse) throw new Error("adresse du serveur inconnue : relancer la ligne d'installation");
    const r = await fetch(`${maj.adresse}/pc/version.json`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`serveur de Muninn injoignable (${r.status})`);
    const v = await r.json();
    // ce qui ne peut pas se faire seul : nouvelle installation demandée, ou nouveau lanceur
    etat.relancer = (Number(v.installeur) || 0) > (Number(maj.installeur) || 0) || (Number(v.lanceur) || 0) > LANCEUR;
    for (const nom of ["pc", "voix", "travail"]) {
      const module = programmes[nom].module;
      if (!present(nom) && !(module && present(module))) continue;
      const ici_ = existsSync(programmes[nom].fichier) ? versionDe(await readFile(programmes[nom].fichier, "utf8")) : 0;
      const la = Number(v[nom]) || 0;
      if (la > ici_ && etat.refusees?.[nom] !== la) await mettreAJour(nom, la, maj.adresse.replace(/\/+$/, ""), etat);
    }
  } catch (e) {
    etat.erreur = String(e?.message || e);
    noter("Mise à jour : " + etat.erreur);
  }
  for (const nom of ["pc", "voix", "travail"]) if (present(nom)) etat[nom] = versionDe(await readFile(programmes[nom].fichier, "utf8"));
  etat.lanceur = LANCEUR;
  await writeFile(fEtat, JSON.stringify(etat, null, 1)).catch(() => {});
}

/* ---------- démarrage ---------- */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const nom of ["pc", "voix"]) if (present(nom)) demarrer(nom);
  noter(`en marche (lanceur ${LANCEUR}) : ${Object.keys(enCours).join(" et ") || "rien à lancer"}.`);
  setTimeout(() => { verifier(); setInterval(verifier, INTERVALLE); }, PREMIERE);
  for (const s of ["SIGTERM", "SIGINT"]) process.on(s, async () => {
    await Promise.all(Object.keys(enCours).map(arreter));
    process.exit(0);
  });
}
