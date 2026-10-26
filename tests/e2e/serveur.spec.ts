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
