// Serveur Railway : livre l'appli construite (dossier dist/) et, sous /api/ia/, relaie les demandes de l'appli
// vers Claude Code connecté à l'abonnement de Corentin. Il ne stocke aucune donnée patient :
// le texte ou le bilan à traiter passe en mémoire, le temps de la demande, puis est oublié.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual, createHash } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as claude from "./serveur/claude.mjs";

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
  ".txt": "text/plain; charset=utf-8"
};

const securite = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()"
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

function json(res, statut, corps) {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...securite });
  res.end(JSON.stringify(corps));
}

function autorise(req, res) {
  if (codeAcces.length < 12) { json(res, 503, { erreur: "Le serveur n'a pas de code d'accès. Ajoutez la variable CODE_ACCES sur Railway (12 caractères au moins)." }); return false; }
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const e = echecs.get(ip);
  if (e && e.n >= 5 && Date.now() - e.depuis < 10 * 60_000) { json(res, 429, { erreur: "Trop d'essais avec un mauvais code. Patientez 10 minutes." }); return false; }
  const recu = /^Bearer (.+)$/.exec(String(req.headers.authorization || ""))?.[1] || "";
  if (!timingSafeEqual(empreinte(recu), empreinte(codeAcces))) {
    const n = e && Date.now() - e.depuis < 10 * 60_000 ? e.n + 1 : 1;
    echecs.set(ip, { n, depuis: n === 1 ? Date.now() : e.depuis });
    json(res, 401, { erreur: "Code d'accès refusé." });
    return false;
  }
  echecs.delete(ip);
  return true;
}

function lireCorps(req, max) {
  return new Promise((ok, ko) => {
    let taille = 0; const morceaux = [];
    req.on("data", d => {
      taille += d.length;
      if (taille > max) { ko(new Error("trop gros")); req.destroy(); return; }
      morceaux.push(d);
    });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(morceaux).toString("utf8") || "{}")); } catch { ko(new Error("illisible")); } });
    req.on("error", ko);
  });
}

async function api(req, res, chemin) {
  if (!autorise(req, res)) return;
  try {
    if (req.method === "GET" && chemin === "/api/ia/etat") return json(res, 200, await claude.etat());
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
      const r = await claude.travailler(demande);
      return json(res, r.erreur ? 502 : 200, r);
    }
    json(res, 404, { erreur: "Introuvable." });
  } catch (e) {
    json(res, e?.message === "trop gros" ? 413 : 400, { erreur: e?.message === "trop gros" ? "Bilan trop volumineux." : "Demande illisible." });
  }
}

createServer(async (req, res) => {
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

  res.writeHead(200, {
    "Content-Type": types[extname(trouve.complet)] ?? "application/octet-stream",
    "Cache-Control": cache(chemin),
    ...securite
  });
  res.end(req.method === "HEAD" ? undefined : trouve.contenu);
}).listen(port, "0.0.0.0", () => console.log(`Appli servie sur le port ${port}`));
