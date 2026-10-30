// Muninn sur le PC : garde la base complète des patients et fait le lien entre les appareils (tablette, téléphone, PC).
// Programme Node sans dépendance. Il n'écoute que sur le PC lui-même (127.0.0.1) : Tailscale le rend joignable,
// en HTTPS, par les seuls appareils de Corentin (« tailscale serve »). Aucun autre ordinateur ne peut l'atteindre.
// Chaque demande doit porter le code du PC (créé à la première ouverture, rangé dans code.txt).
//
// Dossier des données (MUNINN_DOSSIER, sinon C:\ProgramData\Muninn sous Windows, ~/.muninn ailleurs) :
//   donnees.json   tous les éléments partagés, chacun avec son numéro de modification (rev) ;
//   fichiers/      les PDF et photos des bilans (jamais effacés) ;
//   copies/        une copie de donnees.json par jour (avant le premier changement), gardée 60 jours ;
//   code.txt       le code à taper sur chaque appareil.
import { createServer } from "node:http";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

const VERSION = 1;
const dossier = process.env.MUNINN_DOSSIER || (process.platform === "win32" ? join(process.env.ProgramData || "C:\\ProgramData", "Muninn") : join(homedir(), ".muninn"));
const port = Number(process.env.MUNINN_PORT) || 4747;
const hote = process.env.MUNINN_HOTE || "127.0.0.1";
const COPIES_GARDEES = 60;
const PAR_PAGE = 500;

const fDonnees = join(dossier, "donnees.json"), dFichiers = join(dossier, "fichiers"), dCopies = join(dossier, "copies"), fCode = join(dossier, "code.txt");

/* ---------- les données ---------- */

/* elements : clé -> { rev, valeur } ou { rev, supprime: true, ancien } (l'ancienne valeur reste, pour pouvoir la retrouver) */
let base = { rev: 0, elements: {} };
let file = Promise.resolve();          // les écritures passent une par une
const enFile = fn => (file = file.then(fn, fn));

async function charger() {
  await mkdir(dFichiers, { recursive: true });
  await mkdir(dCopies, { recursive: true });
  if (existsSync(fDonnees)) base = JSON.parse(await readFile(fDonnees, "utf8"));
  else if (existsSync(fDonnees + ".tmp")) base = JSON.parse(await readFile(fDonnees + ".tmp", "utf8"));   // coupure pendant un enregistrement
}

async function enregistrer() {
  await writeFile(fDonnees + ".tmp", JSON.stringify(base));
  await rename(fDonnees + ".tmp", fDonnees);
}

/* une copie par jour, faite avant le premier changement de la journée : elle garde l'état de la veille au soir */
async function copieDuJour(texte) {
  const jour = new Date().toISOString().slice(0, 10), f = join(dCopies, jour + ".json");
  if (existsSync(f)) return;
  await writeFile(f, texte);
  const anciennes = (await readdir(dCopies)).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().slice(COPIES_GARDEES);
  for (const n of anciennes) await rm(join(dCopies, n), { force: true });
}

async function lireCode() {
  if (process.env.MUNINN_CODE) return process.env.MUNINN_CODE;
  if (existsSync(fCode)) return (await readFile(fCode, "utf8")).trim();
  const lettres = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";     // sans 0/O ni 1/I, faciles à confondre
  const code = Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => lettres[randomInt(lettres.length)]).join("")).join("-");
  await writeFile(fCode, code + "\n");
  return code;
}

/* ---------- accès : le code du PC ---------- */

const empreinte = s => createHash("sha256").update(String(s)).digest();
let code = "";
const echecs = new Map();   // adresse -> { n, depuis }

const entetes = req => ({
  "Access-Control-Allow-Origin": req.headers.origin || "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600",
  "Vary": "Origin",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function json(req, res, statut, corps) {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", ...entetes(req) });
  res.end(JSON.stringify(corps));
}

function autorise(req, res) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const e = echecs.get(ip);
  if (e && e.n >= 5 && Date.now() - e.depuis < 10 * 60_000) { json(req, res, 429, { erreur: "Trop d'essais avec un mauvais code. Patientez 10 minutes." }); return false; }
  const recu = /^Bearer (.+)$/.exec(String(req.headers.authorization || ""))?.[1] || "";
  if (!timingSafeEqual(empreinte(recu.trim().toUpperCase()), empreinte(code.toUpperCase()))) {
    const n = e && Date.now() - e.depuis < 10 * 60_000 ? e.n + 1 : 1;
    echecs.set(ip, { n, depuis: n === 1 ? Date.now() : e.depuis });
    json(req, res, 401, { erreur: "Code refusé." });
    return false;
  }
  echecs.delete(ip);
  return true;
}

function lireOctets(req, max) {
  return new Promise((ok, ko) => {
    let taille = 0; const morceaux = [];
    req.on("data", d => { taille += d.length; if (taille > max) { ko(new Error("trop gros")); req.destroy(); return; } morceaux.push(d); });
    req.on("end", () => ok(Buffer.concat(morceaux)));
    req.on("error", ko);
  });
}
const lireJson = async (req, max) => JSON.parse((await lireOctets(req, max)).toString("utf8") || "{}");

const CLE = /^(dossiers|bilans|seances|parametres)\/[A-Za-z0-9_.:-]{1,100}$/;
const ID_FICHIER = /^[A-Za-z0-9_-]{1,100}$/;

/* ---------- les demandes ---------- */

async function api(req, res, url) {
  const chemin = url.pathname;
  if (req.method === "GET" && chemin === "/api/sync/etat")
    return json(req, res, 200, { muninn: true, version: VERSION, rev: base.rev, elements: Object.keys(base.elements).length });

  /* les modifications depuis le numéro donné, dans l'ordre */
  if (req.method === "GET" && chemin === "/api/sync/changements") {
    const depuis = Number(url.searchParams.get("depuis")) || 0;
    const liste = Object.entries(base.elements).filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev);
    const page = liste.slice(0, PAR_PAGE);
    const suite = liste.length > PAR_PAGE;
    return json(req, res, 200, {
      rev: suite ? page[page.length - 1][1].rev : base.rev, suite,
      changements: page.map(([cle, e]) => e.supprime ? { cle, rev: e.rev, supprime: true } : { cle, rev: e.rev, valeur: e.valeur })
    });
  }

  /* ce qu'un appareil a changé ; refusé pour un élément modifié entre-temps par un autre appareil (l'appareil reçoit puis renvoie) */
  if (req.method === "POST" && chemin === "/api/sync/envoi") {
    const { changements } = await lireJson(req, 60e6);
    if (!Array.isArray(changements)) return json(req, res, 400, { erreur: "Demande illisible." });
    const r = await enFile(async () => {
      if (base.rev) await copieDuJour(JSON.stringify(base));
      const acceptes = [], conflits = [];
      for (const c of changements) {
        if (!c || typeof c.cle !== "string" || !CLE.test(c.cle)) continue;
        const actuel = base.elements[c.cle];
        if ((actuel?.rev ?? 0) !== (Number(c.rev) || 0)) { conflits.push(c.cle); continue; }
        base.rev++;
        base.elements[c.cle] = c.supprime ? { rev: base.rev, supprime: true, ancien: actuel?.supprime ? actuel.ancien : actuel?.valeur ?? null } : { rev: base.rev, valeur: c.valeur };
        acceptes.push({ cle: c.cle, rev: base.rev });
      }
      if (acceptes.length) await enregistrer();
      return { acceptes, conflits, rev: base.rev };
    });
    return json(req, res, 200, r);
  }

  if (req.method === "POST" && chemin === "/api/sync/fichiers/absents") {
    const { ids } = await lireJson(req, 1e6);
    if (!Array.isArray(ids)) return json(req, res, 400, { erreur: "Demande illisible." });
    return json(req, res, 200, { absents: ids.filter(id => typeof id === "string" && ID_FICHIER.test(id) && !existsSync(join(dFichiers, id))) });
  }

  const m = /^\/api\/sync\/fichiers\/([^/]+)$/.exec(chemin);
  if (m) {
    const id = m[1];
    if (!ID_FICHIER.test(id)) return json(req, res, 400, { erreur: "Nom de fichier refusé." });
    const f = join(dFichiers, id);
    if (req.method === "PUT") {
      if (existsSync(f)) { await lireOctets(req, 200e6); return json(req, res, 200, { ok: true }); }   // un fichier ne change jamais
      const tmp = f + ".part";
      await new Promise((ok, ko) => {
        let taille = 0;
        const sortie = createWriteStream(tmp);
        req.on("data", d => { taille += d.length; if (taille > 200e6) { req.destroy(); sortie.destroy(); ko(new Error("trop gros")); } });
        req.pipe(sortie).on("finish", ok).on("error", ko);
        req.on("error", ko);
      });
      await writeFile(f + ".type", String(req.headers["content-type"] || "application/octet-stream"));
      await rename(tmp, f);
      return json(req, res, 200, { ok: true });
    }
    if (req.method === "GET") {
      if (!existsSync(f)) return json(req, res, 404, { erreur: "Fichier absent." });
      const type = existsSync(f + ".type") ? (await readFile(f + ".type", "utf8")).trim() : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Content-Length": (await stat(f)).size, ...entetes(req) });
      createReadStream(f).pipe(res);
      return;
    }
  }
  json(req, res, 404, { erreur: "Introuvable." });
}

await charger();
code = await lireCode();

const serveur = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url ?? "/", "http://x"); } catch { res.writeHead(400).end(); return; }
  if (req.method === "OPTIONS") { res.writeHead(204, entetes(req)).end(); return; }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...entetes(req) });
    res.end("Muninn est en marche sur ce PC. Ouvrez Muninn sur vos appareils pour vous en servir.\n");
    return;
  }
  if (!url.pathname.startsWith("/api/sync/")) return json(req, res, 404, { erreur: "Introuvable." });
  if (!autorise(req, res)) return;
  try { await api(req, res, url); }
  catch (e) {
    console.error(e);
    if (!res.headersSent) json(req, res, e?.message === "trop gros" ? 413 : 400, { erreur: e?.message === "trop gros" ? "Trop volumineux." : "Demande illisible." });
  }
}).listen(port, hote, () => console.log(`Muninn (PC) en marche sur http://${hote}:${port} — données dans ${dossier}`));

for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  serveur.close();
  file.finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
});
