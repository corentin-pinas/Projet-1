// Serveur Railway : livre l'appli construite (dossier dist/) et, sous /api/ia/, relaie les demandes de l'appli
// vers Claude Code connecté à l'abonnement de Corentin. Il ne stocke aucune donnée patient :
// le texte ou le bilan à traiter passe en mémoire, le temps de la demande, puis est oublié.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual, createHash } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as claude from "./serveur/claude.mjs";
import * as transcription from "./serveur/transcription.mjs";

const racine = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT) || 3000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ps1": "text/plain; charset=utf-8"
};

const securite = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self)"   // micro : dictée enregistrée (transcription par Whisper)
};

/* Les fichiers de assets/ portent une empreinte dans leur nom : on peut les garder longtemps.
   Le reste (page, service worker, manifeste) doit être revérifié pour que les mises à jour arrivent. */
const cache = chemin => chemin.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";

async function fichier(chemin) {
  const complet = normalize(join(racine, chemin));
  if (complet !== racine && !complet.startsWith(racine + sep)) return null; // pas de sortie du dossier dist
  try {
    if ((await stat(complet)).isFile()) return { complet, contenu: await readFile(complet) };
  } catch { /* absent */ }
  return null;
}

/* ---------- accès à l'IA : réservé à qui connaît le code d'accès (variable CODE_ACCES sur Railway) ---------- */

const empreinte = s => createHash("sha256").update(String(s)).digest();
const codeAcces = process.env.CODE_ACCES || "";
const echecs = new Map();   // adresse -> { n, depuis }
/* Mauvais codes reçus, toutes adresses confondues (audit M6). L'adresse d'un appareil n'est pas fiable (un en-tête
   qu'il peut inventer) : la vraie protection ne dépend donc pas d'elle. Au-delà de ALERTE mauvais codes en une heure,
   le serveur n'examine plus qu'un code toutes les 3 secondes, pour tout le monde : deviner un code de 12 caractères
   devient impossible, et le bon code passe toujours (les appareils de Corentin réessaient seuls). Les mauvais codes des
   dernières 24 heures sont annoncés à l'appli, qui prévient Corentin dès le 3e. Rien n'est écrit sur disque. */
const refus = [];   // heures des mauvais codes (7 jours au plus)
const ALERTE = Number(process.env.CODE_ALERTE) || 20;
let prochainExamen = 0;
const adresseDe = req => String(req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean).at(-1) || req.socket.remoteAddress || "");
const refusRecents = (depuis = Date.now() - 24 * 3600_000) => refus.filter(t => t >= depuis);

function json(res, statut, corps) {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...securite });
  res.end(JSON.stringify(corps));
}

function autorise(req, res) {
  if (codeAcces.length < 12) { json(res, 503, { erreur: "Le serveur n'a pas de code d'accès. Ajoutez la variable CODE_ACCES sur Railway (12 caractères au moins)." }); return false; }
  const maintenant = Date.now();
  while (refus.length && refus[0] < maintenant - 7 * 24 * 3600_000) refus.shift();
  if (refus.length > 5000) refus.splice(0, refus.length - 5000);
  if (refusRecents(maintenant - 3600_000).length >= ALERTE) {
    if (maintenant < prochainExamen) { json(res, 429, { erreur: "Le serveur reçoit beaucoup de mauvais codes d'accès : il ralentit. Nouvel essai dans quelques minutes.", nature: "passager" }); return false; }
    prochainExamen = maintenant + 3000;
  }
  const ip = adresseDe(req);
  const e = echecs.get(ip);
  if (e && e.n >= 5 && maintenant - e.depuis < 10 * 60_000) { json(res, 429, { erreur: "Trop d'essais avec un mauvais code. Patientez 10 minutes.", nature: "passager" }); return false; }
  const recu = /^Bearer (.+)$/.exec(String(req.headers.authorization || ""))?.[1] || "";
  if (!timingSafeEqual(empreinte(recu), empreinte(codeAcces))) {
    const n = e && maintenant - e.depuis < 10 * 60_000 ? e.n + 1 : 1;
    echecs.set(ip, { n, depuis: n === 1 ? maintenant : e.depuis });
    if (echecs.size > 10_000) echecs.clear();
    refus.push(maintenant);
    console.log(`Code d'accès refusé (${refusRecents(maintenant - 3600_000).length} dans l'heure).`);   // jamais le code reçu
    json(res, 401, { erreur: "Code d'accès refusé.", nature: "definitif" });
    return false;
  }
  echecs.delete(ip);
  return true;
}

function lireCorps(req, max) {
  return lireOctets(req, max).then(b => { try { return JSON.parse(b.toString("utf8") || "{}"); } catch { throw new Error("illisible"); } });
}

function lireOctets(req, max) {
  return new Promise((ok, ko) => {
    let taille = 0; const morceaux = [];
    req.on("data", d => {
      taille += d.length;
      if (taille > max) { ko(new Error("trop gros")); req.destroy(); return; }
      morceaux.push(d);
    });
    req.on("end", () => ok(Buffer.concat(morceaux)));
    req.on("error", ko);
  });
}

async function api(req, res, chemin) {
  if (!autorise(req, res)) return;
  try {
    if (req.method === "GET" && chemin === "/api/ia/etat") {
      const r = refusRecents();
      return json(res, 200, { ...await claude.etat(), transcription: transcription.disponible(), refus: { n: r.length, dernier: r.length ? new Date(r.at(-1)).toISOString() : null } });
    }
    if (req.method === "POST" && chemin === "/api/ia/transcrire") {
      const audio = await lireOctets(req, 25e6);
      if (!audio.length) return json(res, 400, { erreur: "Enregistrement vide." });
      const r = await transcription.transcrire(audio, String(req.headers["content-type"] || "audio/webm"));
      return json(res, r.erreur ? 502 : 200, r);
    }
    if (req.method === "POST" && chemin === "/api/ia/connexion") return json(res, 200, await claude.demarrerConnexion());
    if (req.method === "POST" && chemin === "/api/ia/connexion/code") {
      const { code } = await lireCorps(req, 4_000);
      if (typeof code !== "string" || !code.trim()) return json(res, 400, { erreur: "Code manquant." });
      return json(res, 200, await claude.envoyerCode(code));
    }
    if (req.method === "POST" && chemin === "/api/ia/deconnexion") return json(res, 200, await claude.deconnecter());
    if (req.method === "POST" && chemin === "/api/ia/travail") {
      const demande = await lireCorps(req, 40e6);
      const refus = claude.verifierDemande(demande);
      if (refus) return json(res, 400, { erreur: refus });
      /* l'appli a lâché (délai dépassé, appli fermée, réseau coupé) : la demande est retirée ou Claude arrêté (audit M8) */
      const abandon = new AbortController();
      res.on("close", () => { if (!res.writableEnded) abandon.abort(); });
      const r = await claude.travailler(demande, abandon.signal);
      if (abandon.signal.aborted) return;
      return json(res, r.erreur ? 502 : 200, r);
    }
    json(res, 404, { erreur: "Introuvable." });
  } catch (e) {
    json(res, e?.message === "trop gros" ? 413 : 400, { erreur: e?.message === "trop gros" ? (chemin === "/api/ia/transcrire" ? "Enregistrement trop long : coupez-le en plusieurs." : "Bilan trop volumineux.") : "Demande illisible." });
  }
}

const serveur = createServer(async (req, res) => {
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); }
  catch { res.writeHead(400, securite).end(); return; }

  if (chemin.startsWith("/api/ia/")) return api(req, res, chemin);

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", ...securite }).end();
    return;
  }

  let trouve = await fichier(chemin.endsWith("/") ? chemin + "index.html" : chemin);
  // une adresse inconnue sans extension ouvre l'appli (c'est elle qui gère ses écrans)
  if (!trouve && !extname(chemin)) { trouve = await fichier("/index.html"); chemin = "/index.html"; }
  if (!trouve) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...securite }).end("Introuvable"); return; }

  /* programme d'installation du PC : il télécharge Muninn depuis l'adresse même où il a été pris */
  if (chemin === "/pc/installer.ps1") {
    const hote = String(req.headers["x-forwarded-host"] || req.headers.host || "");
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    if (!/^[A-Za-z0-9.:-]+$/.test(hote)) { res.writeHead(400, securite).end(); return; }
    trouve = { ...trouve, contenu: Buffer.from(trouve.contenu.toString("utf8").replaceAll("__ADRESSE__", `${proto}://${hote}`)) };
  }

  res.writeHead(200, {
    "Content-Type": types[extname(trouve.complet)] ?? "application/octet-stream",
    "Cache-Control": cache(chemin),
    ...securite
  });
  res.end(req.method === "HEAD" ? undefined : trouve.contenu);
}).listen(port, "0.0.0.0", () => console.log(`Appli servie sur le port ${port}`));

/* Railway arrête l'ancienne version (SIGTERM) quand la nouvelle est en ligne : c'est un arrêt normal.
   On finit proprement et on sort sans erreur, sinon Railway le prend pour un plantage et envoie un mail. */
let arret = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => {
  if (arret) return;
  arret = true;
  console.log("Arrêt demandé : fin propre du serveur.");
  claude.arreterTout();
  serveur.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();   // les connexions encore ouvertes n'empêchent pas l'arrêt
});
