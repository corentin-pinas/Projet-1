import { expect, test, type Page } from "@playwright/test";
import { readFileSync, rmSync } from "node:fs";

/* Mode abonnement : l'appli passe par le serveur, qui lance Claude Code. Ici Claude Code est un faux (tests/faux/claude.mjs). */
const CODE = "code-acces-essai-123";
const appels = () => readFileSync(".faux-claude/appels.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l) as { args: string[]; env: string[] });

test.beforeEach(() => { rmSync(".faux-claude/connecte", { force: true }); });

async function fairePdf(page: Page): Promise<Buffer> {
  const p = await page.context().newPage();
  await p.setContent("<h1>Bilan test</h1>");
  const b = await p.pdf();
  await p.close();
  return b;
}

async function connecterAbonnement(page: Page) {
  await page.locator("#etatbtn").click();
  await page.locator("#abocode").fill(CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await expect(page.locator("#abostatut")).toContainText("pas encore connecté");
  await page.getByRole("button", { name: "Connecter mon abonnement Claude" }).click();
  await expect(page.locator("#abolien")).toHaveAttribute("href", /^https:\/\/claude\.com\/cai\/oauth/);
  await page.locator("#abocodeco").fill("BON-CODE");
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByRole("status")).toContainText("Abonnement connecté");
  await expect(page.locator("#abostatut")).toContainText("connecté à votre abonnement");
  await expect(page.locator('[data-id="ia"]')).toHaveClass(/ok/);
  await page.getByRole("button", { name: "Fermer" }).click();
}

test("le serveur refuse l'IA sans le bon code d'accès", async ({ request }) => {
  expect((await request.get("/api/ia/etat")).status()).toBe(401);
  expect((await request.get("/api/ia/etat", { headers: { Authorization: "Bearer mauvais-code-123" } })).status()).toBe(401);
  const r = await request.get("/api/ia/etat", { headers: { Authorization: "Bearer " + CODE } });
  expect(await r.json()).toMatchObject({ installe: true, version: "9.9.9", connecte: false });
});

test("le serveur refuse une demande mal formée", async ({ request }) => {
  const r = await request.post("/api/ia/travail", { headers: { Authorization: "Bearer " + CODE }, data: { system: "x", contenu: [{ type: "tool_use" }], schema: { type: "object" }, effort: "low" } });
  expect(r.status()).toBe(400);
});

test("un mauvais code d'accès saisi sur la tablette est refusé et oublié", async ({ page }) => {
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.locator("#abocode").fill("pas-le-bon-code");
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await expect(page.getByRole("status")).toContainText("Code d'accès refusé");
  await expect(page.locator("#aboform")).toBeVisible();
});

test("connexion de l'abonnement depuis la tablette, puis résumé et mise au propre par l'abonnement", async ({ page }) => {
  await page.goto("/");
  await connecterAbonnement(page);

  await page.locator("#file").setInputFiles([{ name: "Bilan - Anne TISSOT.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".glance")).toContainText("résumé par l'abonnement", { timeout: 15_000 });

  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("douleur deux sur dix mobilisations passives épaule gauche pour la prochaine séance reprendre le renforcement dans une semaine");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance .sc").first()).toContainText("Fait en séance :", { timeout: 15_000 });
  await expect(page.locator(".avenir")).toContainText("Reprendre le renforcement.");

  // Claude Code a été lancé verrouillé : aucun outil, aucun autre connecteur, rien de conservé, et sans clé API ni code d'accès dans son environnement
  const travail = appels().filter(a => a.args[0] === "-p");
  expect(travail).toHaveLength(2);
  for (const { args, env } of travail) {
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--no-session-persistence");
    expect(args).toContain("--json-schema");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(env).not.toContain("ANTHROPIC_API_KEY");
    expect(env).not.toContain("CODE_ACCES");
  }

  await page.locator("#etatbtn").click();
  await expect(page.locator("#iaetat")).toContainText("par votre abonnement Claude");
  await expect(page.locator("#iaetat")).toContainText("pas facturé");
});

test("si l'abonnement est déconnecté, le bilan explique quoi faire", async ({ page }) => {
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.locator("#abocode").fill(CODE);
  await page.getByRole("button", { name: "Enregistrer le code" }).click();
  await expect(page.locator("#abostatut")).toContainText("pas encore connecté");
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.locator("#file").setInputFiles([{ name: "Bilan - Paul ROUX.pdf", mimeType: "application/pdf", buffer: await fairePdf(page) }]);
  await expect(page.locator(".wait")).toContainText("n'est plus connecté à l'abonnement", { timeout: 15_000 });
});

test("la clé API reste verrouillée tant qu'elle n'est pas autorisée", async ({ page }) => {
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await expect(page.locator("#apibloc")).toBeHidden();
  await expect(page.locator("#iacle")).toBeHidden();
});
