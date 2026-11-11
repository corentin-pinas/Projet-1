/* Mise à jour automatique du PC (1.7.0, choix de Corentin du 11 novembre 2026) : le vrai lanceur.mjs fait tourner le vrai
   muninn-pc.mjs dans un dossier temporaire, et un faux serveur de Muninn propose des versions. */
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PCDIR = resolve(__dirname, "../../public/pc");
const CODE = "TEST-PCMU-NINN";
const SOURCE = readFileSync(join(PCDIR, "muninn-pc.mjs"), "utf8");
const VERSION = Number(/\bVERSION\s*=\s*(\d+)/.exec(SOURCE)![1]);
let port = 5100;
const nettoyer: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const f of nettoyer.splice(0)) await f(); });

/* faux serveur de Muninn : version.json et le fichier proposé */
function serveurMaj(versions: Record<string, number>, fichier: string): Promise<string> {
  const p = port++;
  const s: Server = createServer((req, res) => {
    if (req.url === "/pc/version.json") { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(versions)); return; }
    if (req.url === "/pc/muninn-pc.mjs") { res.writeHead(200); res.end(fichier); return; }
    res.writeHead(404).end();
  });
  nettoyer.push(() => new Promise(r => s.close(() => r())));
  return new Promise(r => s.listen(p, "127.0.0.1", () => r(`http://127.0.0.1:${p}`)));
}

async function lancer(adresse: string, installeur = 2) {
  const ici = mkdtempSync(join(tmpdir(), "muninn-lanceur-")), dossier = mkdtempSync(join(tmpdir(), "muninn-donnees-"));
  copyFileSync(join(PCDIR, "lanceur.mjs"), join(ici, "lanceur.mjs"));
  copyFileSync(join(PCDIR, "muninn-pc.mjs"), join(ici, "muninn-pc.mjs"));
  writeFileSync(join(dossier, "maj.json"), JSON.stringify({ adresse, installeur }));
  const p = port++;
  const proc: ChildProcess = spawn(process.execPath, [join(ici, "lanceur.mjs")], {
    env: { ...process.env, MUNINN_DOSSIER: dossier, MUNINN_PORT: String(p), MUNINN_CODE: CODE, MUNINN_PYTHON: join(ici, "pas-de-python"),
      MUNINN_MAJ_PREMIERE: "300", MUNINN_MAJ_INTERVALLE: "3600000", MUNINN_MAJ_SANTE: "8000" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let sortie = ""; proc.stdout!.on("data", x => sortie += x); proc.stderr!.on("data", x => sortie += x);
  nettoyer.push(() => new Promise<void>(r => { if (proc.exitCode !== null) return r(); proc.on("exit", () => r()); proc.kill("SIGTERM"); }));
  const url = `http://127.0.0.1:${p}`;
  const etatPC = async () => {
    try { return await (await fetch(url + "/api/sync/etat", { headers: { Authorization: "Bearer " + CODE } })).json(); } catch { return null; }
  };
  /* attend que la vérification soit écrite (maj-etat.json) et que le PC réponde */
  const apresVerification = async () => {
    for (let i = 0; i < 300; i++) {
      const e = existsSync(join(dossier, "maj-etat.json")) ? await etatPC() : null;
      if (e?.maj?.verifie) return e;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("pas de vérification : " + sortie);
  };
  return { ici, dossier, etatPC, apresVerification, sortie: () => sortie };
}

describe("mise à jour automatique du PC", () => {
  it("version.json annonce les versions réelles des fichiers du PC", () => {
    const v = JSON.parse(readFileSync(join(PCDIR, "version.json"), "utf8"));
    expect(v.pc).toBe(VERSION);
    expect(v.voix).toBe(Number(/^VERSION = (\d+)/m.exec(readFileSync(join(PCDIR, "voix.py"), "utf8"))![1]));
    expect(v.lanceur).toBe(Number(/LANCEUR = (\d+)/.exec(readFileSync(join(PCDIR, "lanceur.mjs"), "utf8"))![1]));
    expect(v.installeur).toBe(Number(/\$Installeur = (\d+)/.exec(readFileSync(join(PCDIR, "installer.ps1"), "utf8"))![1]));
  });

  it("une version plus récente est installée seule, l'ancienne gardée à côté, les données intactes", async () => {
    const nouvelle = SOURCE.replace(/\bVERSION = \d+;/, "VERSION = 99;");
    const pc = await lancer(await serveurMaj({ pc: 99, voix: 1, lanceur: 1, installeur: 2 }, nouvelle));
    const e = await pc.apresVerification();
    for (let i = 0; i < 50 && (await pc.etatPC())?.version !== 99; i++) await new Promise(r => setTimeout(r, 100));
    const apres = await pc.etatPC();
    expect(apres.version).toBe(99);
    expect(apres.maj.faites[0]).toMatchObject({ nom: "pc", de: VERSION, a: 99 });
    expect(apres.maj.relancer).toBe(false);
    expect(readFileSync(join(pc.ici, "muninn-pc.mjs.ancien"), "utf8")).toBe(SOURCE);
    expect(e).toBeTruthy();
  }, 40_000);

  it("une version qui ne démarre pas : retour à l'ancienne, et elle n'est plus réessayée", async () => {
    const cassee = SOURCE.replace(/\bVERSION = \d+;/, "VERSION = 98; throw new Error(\"cassée\");");
    const pc = await lancer(await serveurMaj({ pc: 98, voix: 1, lanceur: 1, installeur: 2 }, cassee));
    const e = await pc.apresVerification();
    expect(e.version).toBe(VERSION);
    expect(e.maj.erreur).toContain("retour à la version " + VERSION);
    expect(e.maj.refusees).toEqual({ pc: 98 });
    expect(readFileSync(join(pc.ici, "muninn-pc.mjs"), "utf8")).toBe(SOURCE);
  }, 40_000);

  it("un fichier au mauvais numéro ou illisible n'est jamais installé", async () => {
    const pc = await lancer(await serveurMaj({ pc: 97, voix: 1, lanceur: 1, installeur: 2 }, "VERSION = 97; ceci n'est pas du JavaScript ("));
    const e = await pc.apresVerification();
    expect(e.version).toBe(VERSION);
    expect(e.maj.erreur).toContain("illisible");
    expect(existsSync(join(pc.ici, "muninn-pc.mjs.ancien"))).toBe(false);
  }, 40_000);

  it("une nouvelle installation demandée (droits Windows, Python, lanceur) : « relancer » est signalé", async () => {
    const pc = await lancer(await serveurMaj({ pc: VERSION, voix: 1, lanceur: 1, installeur: 3 }, SOURCE), 2);
    const e = await pc.apresVerification();
    expect(e.maj.relancer).toBe(true);
    expect(e.maj.erreur).toBeUndefined();
  }, 40_000);
});
