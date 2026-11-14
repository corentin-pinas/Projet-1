/* Lance le vrai Muninn du PC (public/pc/muninn-pc.mjs) dans un dossier temporaire, pour les tests de partage. */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const CODE = "TEST-PCMU-NINN";
const PROGRAMME = resolve(__dirname, "../../public/pc/muninn-pc.mjs");
export type PC = { url: string; dossier: string; proc: ChildProcess; sortie: () => string; arreter: () => Promise<void> };
let port = 4900;

export const dossierPC = () => mkdtempSync(join(tmpdir(), "muninn-pc-"));

/* démarre le PC ; renvoie null s'il s'arrête au démarrage (avec ce qu'il a écrit) */
export async function demarrerPC(dossier = dossierPC(), env: Record<string, string> = {}): Promise<PC | { arret: string }> {
  const p = port++;
  const proc = spawn(process.execPath, [PROGRAMME], {
    env: { ...process.env, MUNINN_DOSSIER: dossier, MUNINN_PORT: String(p), MUNINN_CODE: CODE, ...env }, stdio: ["ignore", "pipe", "pipe"]
  });
  let sortie = ""; proc.stdout!.on("data", x => sortie += x); proc.stderr!.on("data", x => sortie += x);
  const url = `http://127.0.0.1:${p}`;
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(url + "/")).ok) break; } catch { /* pas encore */ }
    if (proc.exitCode !== null) return { arret: sortie };
    await new Promise(r => setTimeout(r, 50));
  }
  return { url, dossier, proc, sortie: () => sortie,
    arreter: () => new Promise(r => { if (proc.exitCode !== null) return r(); proc.on("exit", () => r()); proc.kill("SIGTERM"); }) };
}

export async function lancerPC(dossier?: string, env?: Record<string, string>): Promise<PC> {
  const pc = await demarrerPC(dossier, env);
  if ("arret" in pc) throw new Error("Le PC s'est arrêté au démarrage : " + pc.arret);
  return pc;
}

export const changementsPC = async (pc: PC) =>
  (await fetch(pc.url + "/api/sync/changements?depuis=0", { headers: { Authorization: "Bearer " + CODE } })).json();
