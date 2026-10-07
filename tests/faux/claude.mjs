#!/usr/bin/env node
// Faux Claude Code pour les tests : imite les commandes utilisées par le serveur, sans rien appeler.
// Note chaque lancement dans $CLAUDE_CONFIG_DIR/appels.jsonl pour que les tests vérifient les options passées.
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.CLAUDE_CONFIG_DIR || "/tmp/faux-claude";
mkdirSync(dir, { recursive: true });
const connecte = join(dir, "connecte");
const args = process.argv.slice(2);
appendFileSync(join(dir, "appels.jsonl"), JSON.stringify({ args, env: Object.keys(process.env) }) + "\n");

const lireTout = () => new Promise(ok => { let s = ""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => ok(s)); });

if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") {
  console.log(JSON.stringify({ loggedIn: existsSync(connecte), authMethod: existsSync(connecte) ? "claude.ai" : "none" }, null, 2));
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "logout") { try { (await import("node:fs")).rmSync(connecte); } catch {} process.exit(0); }
if (args[0] === "auth" && args[1] === "login") {
  console.log("Opening browser to sign in…");
  console.log("If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=essai");
  process.stdout.write("Paste code here if prompted > ");
  let s = "";
  process.stdin.on("data", d => {
    s += d;
    if (s.includes("\n")) {
      if (s.trim() === "BON-CODE") { writeFileSync(connecte, "1"); console.log("Login successful."); process.exit(0); }
      console.log("Invalid code."); process.exit(1);
    }
  });
} else if (args[0] === "-p") {
  const entree = JSON.parse((await lireTout()).trim().split("\n")[0]);
  const contenu = entree.message.content;
  if (!existsSync(connecte)) {
    console.log(JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "Not logged in · Please run /login" }));
    process.exit(1);
  }
  const document = contenu.some(b => b.type === "document" || b.type === "image");
  const sortie = document
    ? { region: "Épaule G", date_bilan: "02/10/2026", age: 61, coup_oeil: "Raideur d'épaule gauche depuis 3 mois (résumé par l'abonnement).", chiffres: [{ label: "EVA", valeur: "4/10" }], sections: [{ titre: "Examen", items: ["Élévation 110°"] }], a_verifier: [] }
    : { propre: "État du patient : douleur 2/10.\nFait en séance : mobilisations passives de l'épaule gauche.\nÀ venir : reprendre le renforcement, dans une semaine.", resume: "Reprendre le renforcement.", rdv_date: null, rdv_heure: null };
  console.log("ligne qui n'est pas du JSON");
  console.log(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5", tools: ["StructuredOutput"] }));
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "StructuredOutput" }] } }));
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: 2, total_cost_usd: 0.12, structured_output: sortie }));
  process.exit(0);
} else process.exit(2);
