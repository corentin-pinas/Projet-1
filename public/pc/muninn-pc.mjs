// Muninn sur le PC : garde la base complète des patients et fait le lien entre les appareils (tablette, téléphone, PC).
// Programme Node sans dépendance. Il n'écoute que sur le PC lui-même (127.0.0.1) : Tailscale le rend joignable,
// en HTTPS, par les seuls appareils de Corentin (« tailscale serve »). Aucun autre ordinateur ne peut l'atteindre.
// Chaque demande doit porter le code du PC (créé à la première ouverture, rangé dans code.txt).
//
// Dossier des données (MUNINN_DOSSIER, sinon C:\ProgramData\Muninn sous Windows, ~/.muninn ailleurs) :
//   donnees.json   tous les éléments partagés, chacun avec son numéro de modification (rev) ;
//   fichiers/      les PDF et photos des bilans (effacés 30 jours après la suppression du bilan, quand plus rien n'y renvoie) ;
//   copies/        une copie de donnees.json par jour (avant le premier changement), gardée 30 jours ;
//   code.txt       le code à taper sur chaque appareil ;
//   rev-max.txt    le plus grand numéro de modification jamais enregistré (repère pour voir si la base est revenue en arrière) ;
//   journal.log    ce qui s'est passé d'inhabituel (fichier abîmé, base reprise d'une copie), jamais le contenu des dossiers ;
//   modeles/       le modèle de Whisper (voix.py, transcription de la voix sur le PC) ;
//   maj-etat.json  où en est la mise à jour automatique (écrit par lanceur.mjs depuis la 1.7.0, montré dans l'appli) ;
//   travaux/       les enregistrements de voix envoyés par les appareils, le temps de les transcrire (1.9.0) ;
//   ia.json        le code d'accès au serveur de l'appli, donné par les appareils avec chaque travail (1.9.0).
//
// Travail en tâche de fond (1.9.0) : travail.mjs, à côté de ce fichier, transcrit et range les dictées envoyées par les
// appareils, puis écrit le résultat dans la base (voir src/pc/travail.ts). Sans lui, Muninn marche comme avant.
import { createServer } from "node:http";
import { appendFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERSION = 8;
const ici = dirname(fileURLToPath(import.meta.url));
const voix = process.env.MUNINN_VOIX_URL || "http://127.0.0.1:4748";   // Whisper du PC (voix.py)
const dossier = process.env.MUNINN_DOSSIER || (process.platform === "win32" ? join(process.env.ProgramData || "C:\\ProgramData", "Muninn") : join(homedir(), ".muninn"));
const port = Number(process.env.MUNINN_PORT) || 4747;
const hote = process.env.MUNINN_HOTE || "127.0.0.1";
/* Durée de garde (choix de Corentin du 7 novembre 2026) : 30 copies quotidiennes ; un élément supprimé reste
   récupérable 30 jours (ancienne version, PDF), puis il est effacé définitivement (audit F9-f). */
const GARDE_JOURS = Number(process.env.MUNINN_GARDE_JOURS) || 30;
const COPIES_GARDEES = GARDE_JOURS;
const PAR_PAGE = 500;

const fDonnees = join(dossier, "donnees.json"), dFichiers = join(dossier, "fichiers"), dCopies = join(dossier, "copies"), fCode = join(dossier, "code.txt");
const fJournal = join(dossier, "journal.log"), fRevMax = join(dossier, "rev-max.txt");
const dTravaux = join(dossier, "travaux"), fIA = join(dossier, "ia.json");
const COPIE = /^\d{4}-\d{2}-\d{2}\.json$/;

/* ---------- les données ---------- */

/* elements : clé -> { rev, valeur } ou { rev, supprime: true, quand, ancien } (l'ancienne valeur reste 30 jours après
   « quand », pour pouvoir la retrouver ; ensuite seule la marque « supprimé » reste, pour les appareils).
   id : l'identité de la base, tirée au hasard. Elle change quand la base repart d'un état plus ancien (copie remise,
   origine « reprise ») ou quand un appareil la remet à niveau (origine « remise ») : les appareils voient ainsi que
   leurs numéros ne correspondent plus, au lieu d'afficher « À jour » à tort (audit E1). */
let base = { rev: 0, elements: {} };
let revMax = 0;
const nouvelId = () => randomBytes(9).toString("base64url");
let file = Promise.resolve();          // les écritures passent une par une
const enFile = fn => (file = file.then(fn, fn));

async function noter(texte) {
  console.log(texte);
  try { await appendFile(fJournal, new Date().toISOString() + " " + texte + "\n"); } catch { /* journal impossible : on continue */ }
}

/* une base lisible et bien formée, sinon null */
async function lire(f) {
  try {
    const b = JSON.parse(await readFile(f, "utf8"));
    if (b && typeof b.rev === "number" && b.elements && typeof b.elements === "object") return b;
  } catch { /* abîmé */ }
  return null;
}

/* Au démarrage. Une coupure de courant pendant une écriture peut laisser donnees.json abîmé : Muninn ne doit pas
   rester arrêté. Ordre de secours : donnees.json, puis donnees.json.tmp (coupure entre l'écriture et le renommage),
   puis la plus récente copie lisible de copies/. Le fichier abîmé est mis de côté, jamais effacé. */
async function charger() {
  await chargerFichier();
  try { revMax = Number((await readFile(fRevMax, "utf8")).trim()) || 0; } catch { revMax = 0; }
  let change = false;
  if (!base.id) { base.id = nouvelId(); base.origine = base.origine ?? "neuve"; change = true; }
  if (base.rev < revMax) {
    await noter(`La base est revenue en arrière (n° ${base.rev} au lieu de ${revMax}) : nouvelle identité. Les appareils le signaleront et proposeront de remettre le PC à niveau.`);
    base.id = nouvelId(); base.origine = "reprise"; base.rev = revMax; change = true;
  }
  if (change) await enregistrer();
}

async function chargerFichier() {
  await mkdir(dFichiers, { recursive: true });
  await mkdir(dCopies, { recursive: true });
  let abime = false;
  if (existsSync(fDonnees)) {
    const b = await lire(fDonnees);
    if (b) { base = b; return; }
    const cote = fDonnees + ".abime-" + new Date().toISOString().replace(/[:.]/g, "-");
    await rename(fDonnees, cote);
    abime = true;
    await noter(`donnees.json illisible : mis de côté sous ${cote.slice(dossier.length + 1)}.`);
  }
  if (existsSync(fDonnees + ".tmp")) {
    const b = await lire(fDonnees + ".tmp");
    if (b) { base = b; await noter("Base reprise depuis donnees.json.tmp (dernière écriture interrompue)."); await enregistrer(); return; }
    await noter("donnees.json.tmp illisible : ignoré.");
    abime = true;
  }
  const copies = (await readdir(dCopies)).filter(n => COPIE.test(n)).sort().reverse();
  for (const n of copies) {
    const b = await lire(join(dCopies, n));
    if (b) {
      base = b; base.id = nouvelId(); base.origine = "reprise";
      await noter(`Base reprise depuis la copie ${n} : nouvelle identité ; les changements faits depuis sont à renvoyer par les appareils.`);
      await enregistrer(); return;
    }
    await noter(`Copie ${n} illisible : ignorée.`);
  }
  if (abime || copies.length) await noter("Aucune copie lisible : démarrage sur une base vide.");
}

/* écrit le fichier jusque sur le disque avant de rendre la main (sinon une coupure peut le laisser vide) */
async function ecrireSur(f, texte) {
  const h = await open(f, "w");
  try { await h.writeFile(texte); await h.sync(); } finally { await h.close(); }
}

async function enregistrer() {
  await ecrireSur(fDonnees + ".tmp", JSON.stringify(base));
  await rename(fDonnees + ".tmp", fDonnees);
  if (base.rev > revMax) { revMax = base.rev; await ecrireSur(fRevMax, String(revMax)); }
}

/* une copie par jour, faite avant le premier changement de la journée : elle garde l'état de la veille au soir */
async function copieDuJour(texte) {
  const jour = new Date().toISOString().slice(0, 10), f = join(dCopies, jour + ".json");
  if (existsSync(f)) return;
  await ecrireSur(f, texte);
  const anciennes = (await readdir(dCopies)).filter(n => COPIE.test(n)).sort().reverse().slice(COPIES_GARDEES);
  for (const n of anciennes) await rm(join(dCopies, n), { force: true });
}

/* marque « supprimé » : l'ancienne version reste à côté, datée, pour être retrouvée pendant GARDE_JOURS jours */
const supprime = actuel => actuel?.supprime
  ? { rev: base.rev, supprime: true, quand: actuel.quand ?? new Date().toISOString(), ...(actuel.ancien !== undefined ? { ancien: actuel.ancien } : {}) }
  : { rev: base.rev, supprime: true, quand: new Date().toISOString(), ancien: actuel?.valeur ?? null };

const idsFichiers = v => Array.isArray(v?.fichiers) ? v.fichiers.map(f => f?.id).filter(x => typeof x === "string") : [];

/* Effacement définitif, au démarrage puis toutes les 6 heures : l'ancienne version des éléments supprimés depuis plus de
   GARDE_JOURS jours, les copies spéciales (avant une remise à niveau) plus vieilles, et les PDF ou photos auxquels plus
   rien ne renvoie (ni un bilan, ni une ancienne version gardée, ni une copie). Un fichier arrivé depuis moins de 2 jours
   n'est jamais effacé : son bilan peut être encore en route. Le journal note le nombre, jamais les noms. */
async function purger() {
  const limite = Date.now() - GARDE_JOURS * 864e5, aujourdhui = new Date().toISOString();
  let anciens = 0, change = false;
  for (const e of Object.values(base.elements)) {
    if (!e.supprime) continue;
    if (!e.quand) { e.quand = aujourdhui; change = true; continue; }   // suppression d'avant cette version : 30 jours à partir d'aujourd'hui
    if (e.ancien !== undefined && Date.parse(e.quand) < limite) { delete e.ancien; anciens++; change = true; }
  }
  if (change) await enregistrer();
  let copies = 0;
  for (const n of await readdir(dCopies)) {
    if (!n.startsWith("avant-remise-")) continue;
    try { if ((await stat(join(dCopies, n))).mtimeMs < limite) { await rm(join(dCopies, n), { force: true }); copies++; } } catch { /* déjà parti */ }
  }
  const gardes = new Set();
  const garder = b => { for (const e of Object.values(b?.elements ?? {})) { for (const id of idsFichiers(e.valeur)) gardes.add(id); for (const id of idsFichiers(e.ancien)) gardes.add(id); } };
  garder(base);
  for (const n of await readdir(dCopies)) {
    if (!n.endsWith(".json")) continue;
    const b = await lire(join(dCopies, n));
    if (!b) return;   // une copie illisible : prudence, on n'efface aucun fichier cette fois
    garder(b);
  }
  let fichiers = 0;
  for (const n of await readdir(dFichiers)) {
    if (n.endsWith(".type") || n.endsWith(".part") || gardes.has(n)) continue;
    try {
      if ((await stat(join(dFichiers, n))).mtimeMs > Date.now() - 2 * 864e5) continue;
      await rm(join(dFichiers, n), { force: true }); await rm(join(dFichiers, n + ".type"), { force: true }); fichiers++;
    } catch { /* déjà parti */ }
  }
  if (anciens || copies || fichiers) await noter(`Effacement définitif (supprimés depuis plus de ${GARDE_JOURS} jours) : ${anciens} ancienne(s) version(s), ${fichiers} fichier(s), ${copies} copie(s) spéciale(s).`);
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
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Muninn-IA",
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
  const ip = req.socket.remoteAddress || "";   // joint en direct par Tailscale : l'en-tête X-Forwarded-For serait inventé (audit M6)
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
  if (req.method === "GET" && chemin === "/api/sync/etat") {
    let maj = null;
    try { maj = JSON.parse(await readFile(join(dossier, "maj-etat.json"), "utf8")); } catch { /* pas encore de lanceur */ }
    return json(req, res, 200, { muninn: true, version: VERSION, id: base.id, origine: base.origine, rev: base.rev, elements: Object.keys(base.elements).length, maj, travail: etatTravail() });
  }

  /* les modifications depuis le numéro donné, dans l'ordre */
  if (req.method === "GET" && chemin === "/api/sync/changements") {
    const depuis = Number(url.searchParams.get("depuis")) || 0;
    const liste = Object.entries(base.elements).filter(([, e]) => e.rev > depuis).sort((a, b) => a[1].rev - b[1].rev);
    const page = liste.slice(0, PAR_PAGE);
    const suite = liste.length > PAR_PAGE;
    return json(req, res, 200, {
      id: base.id, origine: base.origine, rev: suite ? page[page.length - 1][1].rev : base.rev, suite,
      changements: page.map(([cle, e]) => e.supprime ? { cle, rev: e.rev, supprime: true } : { cle, rev: e.rev, valeur: e.valeur })
    });
  }

  /* ce qu'un appareil a changé ; refusé pour un élément modifié entre-temps par un autre appareil (l'appareil reçoit puis renvoie) */
  if (req.method === "POST" && chemin === "/api/sync/envoi") {
    const { changements, id } = await lireJson(req, 60e6);
    if (!Array.isArray(changements)) return json(req, res, 400, { erreur: "Demande illisible." });
    if (id !== undefined && id !== base.id) return json(req, res, 409, { erreur: "La base du PC a changé.", id: base.id, origine: base.origine });
    const r = await enFile(async () => {
      if (base.rev) await copieDuJour(JSON.stringify(base));
      const acceptes = [], conflits = [];
      for (const c of changements) {
        if (!c || typeof c.cle !== "string" || !CLE.test(c.cle)) continue;
        const actuel = base.elements[c.cle];
        if ((actuel?.rev ?? 0) !== (Number(c.rev) || 0)) { conflits.push(c.cle); continue; }
        base.rev++;
        base.elements[c.cle] = c.supprime ? supprime(actuel) : { rev: base.rev, valeur: c.valeur };
        acceptes.push({ cle: c.cle, rev: base.rev });
      }
      if (acceptes.length) await enregistrer();
      return { acceptes, conflits, rev: base.rev };
    });
    // un travail relancé ou abandonné sur un appareil : le travail en tâche de fond le voit tout de suite
    if (r.acceptes.some(a => a.cle === "parametres/travaux")) atelier?.reveiller();
    return json(req, res, 200, r);
  }

  /* Remise à niveau du PC par un appareil, après un retour en arrière : chaque élément envoyé remplace celui du PC
     (null : supprimé). Les éléments que l'appareil ne connaît pas restent. Une copie de l'état d'avant est gardée. */
  if (req.method === "POST" && chemin === "/api/sync/remplacer") {
    const { elements, id } = await lireJson(req, 150e6);
    if (!Array.isArray(elements)) return json(req, res, 400, { erreur: "Demande illisible." });
    if (id !== base.id) return json(req, res, 409, { erreur: "La base du PC a changé.", id: base.id, origine: base.origine });
    const r = await enFile(async () => {
      await ecrireSur(join(dCopies, "avant-remise-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json"), JSON.stringify(base));
      const revs = [];
      for (const e of elements) {
        if (!e || typeof e.cle !== "string" || !CLE.test(e.cle)) continue;
        const actuel = base.elements[e.cle];
        base.rev++;
        base.elements[e.cle] = e.valeur === null || e.valeur === undefined
          ? supprime(actuel)
          : { rev: base.rev, valeur: e.valeur };
        revs.push({ cle: e.cle, rev: base.rev });
      }
      base.id = nouvelId(); base.origine = "remise";
      await enregistrer();
      await noter(`PC remis à niveau par un appareil : ${revs.length} éléments.`);
      return { id: base.id, origine: base.origine, rev: base.rev, revs };
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

/* ---------- la voix : relayée vers Whisper sur ce même PC (voix.py), sans rien garder ---------- */

async function apiVoix(req, res, url) {
  const chemin = url.pathname;
  if (req.method === "GET" && chemin === "/api/voix/etat") {
    try {
      const r = await fetch(voix + "/etat", { signal: AbortSignal.timeout(5_000) });
      const e = await r.json();
      return json(req, res, 200, { installee: true, pret: !!e.pret, modele: e.modele, appareil: e.appareil });
    } catch { return json(req, res, 200, { installee: false, pret: false }); }
  }
  if (req.method === "POST" && chemin === "/api/voix/transcrire") {
    const son = await lireOctets(req, 150e6);
    if (!son.length) return json(req, res, 400, { erreur: "Enregistrement vide." });
    let r;
    try {
      /* indice (1.5.0) : patients du jour et fin du texte précédent, pour aider Whisper ; passé à voix.py, jamais gardé */
      const indice = (url.searchParams.get("indice") || "").slice(0, 4000);
      const entetes = { "Content-Type": String(req.headers["content-type"] || "audio/webm") };
      if (indice) entetes["X-Muninn-Indice"] = encodeURIComponent(indice);
      r = await fetch(voix + "/transcrire", { method: "POST", headers: entetes, body: son, signal: AbortSignal.timeout(20 * 60_000) });
    } catch { return json(req, res, 502, { erreur: "Whisper ne répond pas sur le PC. Redémarrez le PC, ou relancez l'installation de Muninn." }); }
    let corps = {};
    try { corps = await r.json(); } catch { /* réponse vide */ }
    return json(req, res, r.ok ? 200 : r.status === 503 ? 503 : 502, r.ok && corps.texte ? { texte: corps.texte } : { erreur: corps.erreur || "La transcription a échoué sur le PC." });
  }
  json(req, res, 404, { erreur: "Introuvable." });
}

/* ---------- le travail en tâche de fond (1.9.0) : travail.mjs ---------- */

let atelier = null, versionTravail = null;
const ID_TRAVAIL = /^[A-Za-z0-9_-]{8,64}$/;
const valeur = cle => { const e = base.elements[cle]; return e && !e.supprime ? e.valeur : null; };
const lecture = {
  lire: valeur,
  liste: prefixe => Object.entries(base.elements).filter(([cle, e]) => cle.startsWith(prefixe) && !e.supprime).map(([, e]) => e.valeur)
};
async function adresseIA() {
  if (process.env.MUNINN_IA_ADRESSE) return process.env.MUNINN_IA_ADRESSE;
  try { return JSON.parse(await readFile(join(dossier, "maj.json"), "utf8")).adresse || null; } catch { return null; }
}
let ia = { adresse: null, code: null };

const env = {
  ...lecture,
  /* f lit l'état du moment et rend ses écritures : tout est écrit d'un coup, à la suite des envois des appareils */
  transaction: f => enFile(async () => {
    const ecritures = f(lecture).filter(e => e && typeof e.cle === "string" && CLE.test(e.cle));
    if (!ecritures.length) return;
    if (base.rev) await copieDuJour(JSON.stringify(base));
    for (const e of ecritures) {
      base.rev++;
      base.elements[e.cle] = e.valeur === null || e.valeur === undefined ? supprime(base.elements[e.cle]) : { rev: base.rev, valeur: e.valeur };
    }
    await enregistrer();
  }),
  transcrire: async (son, indice) => {
    let r;
    try {
      r = await fetch(voix + "/transcrire", { method: "POST", body: son.octets, signal: AbortSignal.timeout(20 * 60_000),
        headers: { "Content-Type": son.type || "audio/webm", "X-Muninn-Indice": encodeURIComponent(indice || "") } });
    } catch { throw Object.assign(new Error("Whisper ne répond pas sur le PC."), { nature: "passager" }); }
    let corps = {};
    try { corps = await r.json(); } catch { /* réponse vide */ }
    if (!r.ok) throw Object.assign(new Error(corps.erreur || "La transcription a échoué sur le PC."), { nature: r.status === 400 || r.status === 413 ? "definitif" : "passager" });
    return corps.texte || "";
  },
  sons: {
    garder: async (id, son) => {
      await mkdir(dTravaux, { recursive: true });
      await writeFile(join(dTravaux, id + ".type"), son.type || "audio/webm");
      await ecrireSur(join(dTravaux, id), son.octets);
    },
    lire: async id => {
      if (!ID_TRAVAIL.test(id) || !existsSync(join(dTravaux, id))) return null;
      const type = existsSync(join(dTravaux, id + ".type")) ? (await readFile(join(dTravaux, id + ".type"), "utf8")).trim() : "audio/webm";
      return { octets: await readFile(join(dTravaux, id)), type };
    },
    oublier: async id => { if (!ID_TRAVAIL.test(id)) return; await rm(join(dTravaux, id), { force: true }); await rm(join(dTravaux, id + ".type"), { force: true }); },
    liste: async () => existsSync(dTravaux) ? (await readdir(dTravaux)).filter(n => ID_TRAVAIL.test(n)) : []
  },
  ia: () => ia.adresse && ia.code ? { adresse: ia.adresse, code: ia.code } : null,
  noter: t => { noter(t); },
  ...(process.env.MUNINN_TRAVAIL_DELAI_MS ? { delai: () => Number(process.env.MUNINN_TRAVAIL_DELAI_MS) } : {})
};

async function chargerTravail() {
  if (!existsSync(join(ici, "travail.mjs"))) return;
  try {
    ia.adresse = await adresseIA();
    try { ia.code = JSON.parse(await readFile(fIA, "utf8")).code || null; } catch { ia.code = null; }
    const m = await import(pathToFileURL(join(ici, "travail.mjs")).href);
    atelier = m.creer(env);
    versionTravail = m.VERSION;
    m.lireDemande && (lireDemande = m.lireDemande);
    atelier.demarrer().catch(e => noter("Travail en tâche de fond arrêté : " + (e?.message || e)));
  } catch (e) {
    atelier = null; versionTravail = null;
    await noter("Travail en tâche de fond indisponible (travail.mjs illisible) : " + (e?.message || e));
  }
}
let lireDemande = () => null;

/* pret : le PC sait à quel serveur demander l'IA ; les appareils lui confient alors leurs dictées */
const etatTravail = () => atelier ? { ...atelier.etat(), pret: !!ia.adresse } : null;

/* un appareil confie un travail : texte (JSON) ou enregistrement (le son, la demande dans l'adresse) ; il donne aussi le code
   d'accès au serveur de l'appli (X-Muninn-IA), gardé pour les nouveaux essais */
async function apiTravail(req, res, url) {
  if (req.method !== "POST" || url.pathname !== "/api/travail") return json(req, res, 404, { erreur: "Introuvable." });
  if (!atelier || !ia.adresse) return json(req, res, 503, { erreur: "Le travail en tâche de fond n'est pas installé sur le PC." });
  const codeIA = String(req.headers["x-muninn-ia"] || "").trim();
  if (codeIA && codeIA !== ia.code && codeIA.length <= 200) { ia.code = codeIA; await ecrireSur(fIA, JSON.stringify({ code: codeIA })); }
  const enJson = String(req.headers["content-type"] || "").startsWith("application/json");
  let demande, son;
  if (enJson) demande = lireDemande((await lireJson(req, 2e6)).demande);
  else {
    try { demande = lireDemande(JSON.parse(url.searchParams.get("demande") || "{}")); } catch { demande = null; }
    const octets = await lireOctets(req, 150e6);
    if (octets.length) son = { octets, type: String(req.headers["content-type"] || "audio/webm") };
  }
  if (!demande) return json(req, res, 400, { erreur: "Demande illisible." });
  try { return json(req, res, 200, { travail: await atelier.recevoir(demande, son) }); }
  catch (e) { return json(req, res, 400, { erreur: e?.message || "Demande refusée." }); }
}

await charger();
const purgerSur = () => enFile(() => purger().catch(e => noter("Effacement définitif interrompu : " + (e?.message || e))));
await purgerSur();
setInterval(purgerSur, 6 * 3600_000).unref();
code = await lireCode();
await chargerTravail();

const serveur = createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url ?? "/", "http://x"); } catch { res.writeHead(400).end(); return; }
  if (req.method === "OPTIONS") { res.writeHead(204, entetes(req)).end(); return; }
  /* version des programmes, sans code : le lanceur vérifie ainsi qu'une mise à jour du travail en tâche de fond a pris */
  if (url.pathname === "/sante") {
    res.writeHead(200, { "Content-Type": "application/json", ...entetes(req) });
    res.end(JSON.stringify({ pc: VERSION, travail: versionTravail }));
    return;
  }
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...entetes(req) });
    res.end("Muninn est en marche sur ce PC. Ouvrez Muninn sur vos appareils pour vous en servir.\n");
    return;
  }
  if (!url.pathname.startsWith("/api/sync/") && !url.pathname.startsWith("/api/voix/") && url.pathname !== "/api/travail") return json(req, res, 404, { erreur: "Introuvable." });
  if (!autorise(req, res)) return;
  try { await (url.pathname.startsWith("/api/voix/") ? apiVoix(req, res, url) : url.pathname === "/api/travail" ? apiTravail(req, res, url) : api(req, res, url)); }
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
