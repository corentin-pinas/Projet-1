// Faire travailler Claude sur l'abonnement de Corentin, via Claude Code (le CLI officiel) installé sur le serveur.
// L'appli n'appelle jamais l'API avec ce compte : elle lance « claude -p », déjà connecté, comme on le ferait à la main.
// Règle : le jeton de connexion de Claude Code n'est jamais lu, copié ni renvoyé à l'appli.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const racineProjet = fileURLToPath(new URL("..", import.meta.url));

/* Dossier où Claude Code garde sa connexion. Sur Railway, un volume monté sur /data la conserve entre deux mises en ligne. */
export const dossierConfig = process.env.CLAUDE_CONFIG_DIR || (existsSync("/data") ? "/data/claude" : "");

/* Trouver l'exécutable claude : réglage explicite, puis celui installé avec l'appli, puis l'installation habituelle, puis le PATH. */
export function trouverClaude() {
  const candidats = [
    process.env.CLAUDE_BIN,
    join(racineProjet, "node_modules", ".bin", "claude"),
    join(homedir(), ".local", "bin", "claude")
  ].filter(Boolean);
  for (const c of candidats) if (existsSync(c)) return c;
  for (const d of (process.env.PATH || "").split(delimiter)) if (d && existsSync(join(d, "claude"))) return join(d, "claude");
  return null;
}

/* Environnement minimal transmis à Claude Code : rien des secrets du serveur, et surtout pas de clé API
   (sinon Claude Code facturerait l'API au lieu d'utiliser l'abonnement). */
function environnement() {
  const env = { PATH: process.env.PATH || "", HOME: process.env.HOME || homedir(), LANG: process.env.LANG || "C.UTF-8", NO_COLOR: "1", FORCE_COLOR: "0" };
  if (dossierConfig) { mkdirSync(dossierConfig, { recursive: true }); env.CLAUDE_CONFIG_DIR = dossierConfig; }
  for (const k of ["HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"]) if (process.env[k]) env[k] = process.env[k];
  return env;
}

/* Lance une commande claude et renvoie sa sortie (pour --version, auth status, logout). */
function executer(args, { entree = "", delai = 20_000 } = {}) {
  return new Promise(resolve => {
    const bin = trouverClaude();
    if (!bin) return resolve({ code: -1, sortie: "", erreurs: "Claude Code n'est pas installé." });
    const p = spawn(bin, args, { env: environnement(), stdio: ["pipe", "pipe", "pipe"], detached: true });
    let sortie = "", erreurs = "";
    p.stdout.on("data", d => sortie += d);
    p.stderr.on("data", d => erreurs += d);
    const t = setTimeout(() => tuer(p), delai);
    p.on("error", e => { clearTimeout(t); resolve({ code: -1, sortie, erreurs: String(e.message) }); });
    p.on("close", code => { clearTimeout(t); resolve({ code: code ?? -1, sortie, erreurs }); });
    p.stdin.end(entree);
  });
}

/* Tuer le processus lancé et ses enfants, et seulement eux. */
function tuer(p) {
  try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch { /* déjà fini */ } }
}

/* ---------- état ---------- */

export async function etat() {
  const bin = trouverClaude();
  if (!bin) return { installe: false, connecte: false, version: null, methode: null };
  const v = await executer(["--version"]);
  const s = await executer(["auth", "status", "--json"]);
  let statut = {};
  const i = s.sortie.indexOf("{");
  if (i >= 0) { try { statut = JSON.parse(s.sortie.slice(i)); } catch { /* sortie inattendue */ } }
  return {
    installe: v.code === 0,
    version: v.sortie.trim().split(/\s+/)[0] || null,
    connecte: statut.loggedIn === true,
    methode: statut.authMethod ?? null
  };
}

/* ---------- connexion à l'abonnement, sans terminal ---------- */

let connexion = null;   // processus « claude auth login » en cours

/* Démarre la connexion et renvoie le lien à ouvrir. */
export function demarrerConnexion() {
  return new Promise(resolve => {
    const bin = trouverClaude();
    if (!bin) return resolve({ erreur: "Claude Code n'est pas installé sur le serveur." });
    if (connexion) tuer(connexion.p);
    const p = spawn(bin, ["auth", "login", "--claudeai"], { env: environnement(), stdio: ["pipe", "pipe", "pipe"], detached: true });
    const c = { p, texte: "", fini: null, lien: null };
    connexion = c;
    let repondu = false;
    const repondre = r => { if (!repondu) { repondu = true; resolve(r); } };
    const lire = d => {
      c.texte += d;
      const m = /https:\/\/\S+/.exec(c.texte);
      // l'invite « Paste code here if prompted > » arrive sans retour à la ligne : le lien suffit pour répondre
      if (m && !c.lien) { c.lien = m[0]; repondre({ lien: c.lien }); }
    };
    p.stdout.on("data", lire);
    p.stderr.on("data", lire);
    const t = setTimeout(() => { tuer(p); repondre({ erreur: "Claude Code n'a pas proposé de lien de connexion." }); }, 30_000);
    c.fini = new Promise(ok => p.on("close", code => { clearTimeout(t); if (connexion === c) connexion = null; ok(code); }));
    p.on("error", () => repondre({ erreur: "Claude Code n'a pas pu démarrer." }));
    setTimeout(() => tuer(p), 10 * 60_000).unref();   // abandon après 10 minutes sans code
  });
}

/* Envoie le code affiché par la page de connexion. */
export async function envoyerCode(code) {
  const c = connexion;
  if (!c) return { erreur: "Aucune connexion en cours. Recommencez depuis le début." };
  c.p.stdin.write(String(code).trim() + "\n");
  const fin = await Promise.race([c.fini, new Promise(ok => setTimeout(() => ok("delai"), 60_000))]);
  if (fin === "delai") { tuer(c.p); return { erreur: "La connexion n'a pas abouti dans le temps imparti." }; }
  const e = await etat();
  return e.connecte ? { ok: true } : { erreur: "Le code n'a pas été accepté. Recommencez la connexion." };
}

export async function deconnecter() {
  await executer(["auth", "logout"]);
  return etat();
}

/* ---------- travail : une demande, une réponse au format imposé ---------- */

const EFFORTS = new Set(["low", "medium", "high"]);
const TYPES_BLOCS = new Set(["text", "image", "document"]);

export function verifierDemande(d) {
  if (!d || typeof d !== "object") return "Demande illisible.";
  if (typeof d.system !== "string" || !d.system.trim() || d.system.length > 50_000) return "Consigne manquante.";
  if (!Array.isArray(d.contenu) || !d.contenu.length || d.contenu.length > 40) return "Contenu manquant.";
  if (d.contenu.some(b => !b || !TYPES_BLOCS.has(b.type))) return "Contenu non accepté.";
  if (!d.schema || typeof d.schema !== "object" || d.schema.type !== "object") return "Format de réponse manquant.";
  if (!EFFORTS.has(d.effort)) return "Niveau d'effort non accepté.";
  return null;
}

let file = Promise.resolve();   // une seule génération à la fois

export function travailler(demande) {
  const tour = file.then(() => lancer(demande));
  file = tour.catch(() => {});
  return tour;
}

function lancer({ system, contenu, schema, effort }) {
  return new Promise(resolve => {
    const bin = trouverClaude();
    if (!bin) return resolve({ erreur: "Claude Code n'est pas installé sur le serveur." });
    const args = [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--model", "opus", "--effort", effort,
      "--system-prompt", system,
      "--json-schema", JSON.stringify(schema),
      // verrouillage : aucun outil (ni fichiers, ni commandes, ni web), aucun autre connecteur, aucun réglage local, rien de conservé
      "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--setting-sources", "",
      "--no-session-persistence"
    ];
    const p = spawn(bin, args, { env: environnement(), stdio: ["pipe", "pipe", "pipe"], detached: true });
    let tampon = "", resultat = null, erreurs = "";
    const lire = ligne => {
      if (!ligne.trim()) return;
      let o; try { o = JSON.parse(ligne); } catch { return; }   // lignes non JSON ignorées
      if (o.type === "result") resultat = o;
    };
    p.stdout.on("data", d => {
      tampon += d;
      let i;
      while ((i = tampon.indexOf("\n")) >= 0) { lire(tampon.slice(0, i)); tampon = tampon.slice(i + 1); }
    });
    p.stderr.on("data", d => { erreurs = (erreurs + d).slice(-4000); });
    const t = setTimeout(() => { tuer(p); resolve({ erreur: "Claude n'a pas répondu à temps (5 minutes)." }); }, 5 * 60_000);
    p.on("error", () => { clearTimeout(t); resolve({ erreur: "Claude Code n'a pas pu démarrer." }); });
    p.on("close", code => {
      clearTimeout(t);
      lire(tampon);
      if (resultat && !resultat.is_error && resultat.structured_output) {
        return resolve({ donnees: resultat.structured_output, tours: resultat.num_turns ?? null, coutIndicatif: resultat.total_cost_usd ?? null });
      }
      const derniere = erreurs.trim().split("\n").pop() || "";
      const texte = resultat?.result || derniere;
      resolve({ erreur: messageErreur(texte, code) });
    });
    // la demande passe par l'entrée standard, jamais en argument
    p.stdin.end(JSON.stringify({ type: "user", message: { role: "user", content: contenu } }) + "\n");
  });
}

function messageErreur(texte, code) {
  if (/not logged in|login|authenticat|unauthori|401/i.test(texte)) return "Claude Code n'est plus connecté à l'abonnement. Reconnectez-le depuis « État de l'appli ».";
  if (/usage limit|rate limit|limit reached|429/i.test(texte)) return "La limite d'utilisation de l'abonnement est atteinte pour l'instant. Réessayez plus tard.";
  if (/overloaded|529|5\d\d/i.test(texte)) return "Claude est momentanément indisponible. Réessayez plus tard.";
  return `Claude Code n'a pas abouti${code ? ` (code ${code})` : ""}.`;
}
