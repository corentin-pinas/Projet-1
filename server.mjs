// Petit serveur qui livre l'appli construite (dossier dist/) sur Railway.
// Il ne reçoit ni ne stocke aucune donnée patient : tout reste dans la tablette.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

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

createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", ...securite }).end();
    return;
  }
  let chemin;
  try { chemin = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname); }
  catch { res.writeHead(400, securite).end(); return; }

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
