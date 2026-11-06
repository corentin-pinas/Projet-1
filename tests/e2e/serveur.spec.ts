import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("le serveur livre la page sans la garder en cache", async ({ request }) => {
  const r = await request.get("/");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("text/html");
  expect(r.headers()["cache-control"]).toBe("no-cache");
  expect(r.headers()["x-content-type-options"]).toBe("nosniff");
});

test("le service worker est toujours revérifié pour que les mises à jour arrivent", async ({ request }) => {
  const r = await request.get("/sw.js");
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toBe("no-cache");
});

test("une adresse inconnue ouvre l'appli, un fichier inconnu répond introuvable", async ({ request }) => {
  expect((await request.get("/patients/marc")).headers()["content-type"]).toContain("text/html");
  expect((await request.get("/absent.png")).status()).toBe(404);
});

test("impossible de lire un fichier en dehors de l'appli", async ({ request }) => {
  for (const chemin of ["/..%2fpackage.json", "/%2e%2e/server.mjs", "/assets/..%2f..%2fCLAUDE.md"]) {
    const r = await request.get(chemin);
    expect(await r.text()).not.toMatch(/suivi-patients-kine|createServer|Corentin/);
  }
});

test("les autres méthodes sont refusées", async ({ request }) => {
  expect((await request.post("/")).status()).toBe(405);
});

test("arrêté par Railway (SIGTERM), le serveur sort sans erreur : pas de faux mail de plantage", async () => {
  const p = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: "4994" }, stdio: "ignore" });
  await new Promise(r => setTimeout(r, 1500));
  const fin = new Promise<number | null>(r => p.on("exit", code => r(code)));
  p.kill("SIGTERM");
  expect(await fin).toBe(0);
  expect(JSON.parse(readFileSync("railway.json", "utf8")).deploy.startCommand).toBe("node server.mjs");   // npm, lui, sortirait en erreur
});

/* serveur à part, pour ne pas mettre en alerte celui des autres tests */
async function serveurAPart(port: number, env: Record<string, string>) {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const dossier = mkdtempSync(tmpdir() + "/faux-claude-");
  const p = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(port), CODE_ACCES: "code-acces-a-part-123", CLAUDE_BIN: "tests/faux/claude.mjs", CLAUDE_CONFIG_DIR: dossier, ...env }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${port}/`); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  return { p, dossier, url: `http://localhost:${port}` };
}

test("code d'accès : changer d'adresse ne contourne plus rien ; au-delà du seuil le serveur ralentit pour tous, le bon code passe, l'appli voit les refus", async () => {
  const s = await serveurAPart(4995, { CODE_ALERTE: "3" });
  try {
    const essai = (code: string, ip: string) => fetch(s.url + "/api/ia/etat", { headers: { Authorization: "Bearer " + code, "X-Forwarded-For": ip } });
    for (let i = 0; i < 3; i++) expect((await essai("mauvais-code-" + i, `10.0.0.${i}`)).status).toBe(401);   // une adresse inventée à chaque essai
    expect((await essai("mauvais-code-x", "10.0.0.9")).status).toBe(401);   // en alerte : un examen…
    const r = await essai("mauvais-code-y", "10.0.0.10");                     // …puis plus rien pendant 3 s, quelle que soit l'adresse
    expect(r.status).toBe(429);
    expect((await r.json()).nature).toBe("passager");
    await new Promise(r => setTimeout(r, 3100));
    const bon = await essai("code-acces-a-part-123", "10.0.0.11");
    expect(bon.status).toBe(200);
    const etat = await bon.json();
    expect(etat.refus.n).toBe(4);
    expect(etat.refus.dernier).toMatch(/^\d{4}-/);
  } finally { s.p.kill("SIGTERM"); }
});

test("Claude Code : pas de trafic non essentiel ; arrêté quand l'appli abandonne la demande", async () => {
  const { existsSync, writeFileSync } = await import("node:fs");
  const s = await serveurAPart(4996, {});
  try {
    writeFileSync(s.dossier + "/connecte", "1");
    const demande = { system: "Consigne.", contenu: [{ type: "text", text: "DEMANDE-LENTE" }], schema: { type: "object" }, effort: "low" };
    const abandon = new AbortController();
    const envoi = fetch(s.url + "/api/ia/travail", { method: "POST", headers: { Authorization: "Bearer code-acces-a-part-123", "Content-Type": "application/json" }, body: JSON.stringify(demande), signal: abandon.signal }).catch(() => null);
    await expect.poll(() => existsSync(s.dossier + "/lent-debut"), { timeout: 5000 }).toBe(true);
    abandon.abort(); await envoi;
    await new Promise(r => setTimeout(r, 5000));
    expect(existsSync(s.dossier + "/lent-fin")).toBe(false);   // arrêté avant la fin
    const appels = readFileSync(s.dossier + "/appels.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l));
    expect(appels.find(a => a.args[0] === "-p").env).toContain("CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC");
  } finally { s.p.kill("SIGTERM"); }
});

test("3 mauvais codes en 24 heures : un bandeau le dit dans l'appli ; « C'est moi » le fait disparaître", async ({ browser }) => {
  const s = await serveurAPart(4997, {});
  try {
    for (let i = 0; i < 3; i++) await fetch(s.url + "/api/ia/etat", { headers: { Authorization: "Bearer mauvais-" + i } });
    const page = await (await browser.newContext()).newPage();
    await page.goto(s.url + "/");
    await expect(page.locator("#alertecode")).toBeHidden();   // pas de code réglé : rien à vérifier
    await page.locator("#etatbtn").click();
    await page.locator("#abocode").fill("code-acces-a-part-123");
    await page.getByRole("button", { name: "Enregistrer le code" }).click();
    await page.locator("#etatclose").click();
    await page.reload();
    await expect(page.locator("#alertecode")).toContainText("3 mauvais codes d'accès");
    await page.getByRole("button", { name: "C'est moi" }).click();
    await expect(page.locator("#alertecode")).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(page.locator("#alertecode")).toBeHidden();
    await page.context().close();
  } finally { s.p.kill("SIGTERM"); }
});
