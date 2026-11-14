// Construit public/pc/travail.mjs (1.9.0) : le travail du PC en tâche de fond, à partir de src/pc/travail.ts et des modules
// de l'appli qu'il utilise (consignes de l'IA, règles de rangement). Un seul fichier sans dépendance, chargé par muninn-pc.mjs
// et mis à jour par le lanceur du PC comme les autres (numéro VERSION en tête du fichier).
// Lancé par « npm run build » ; le fichier construit est aussi gardé dans le dépôt (tests du PC, installation).
import { build } from "rolldown";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const racine = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(racine + "src/pc/travail.ts", "utf8");
const version = /export const VERSION = (\d+);/.exec(source)?.[1];
if (!version) throw new Error("VERSION introuvable dans src/pc/travail.ts");
const sortie = process.argv[2] || racine + "public/pc/travail.mjs";

await build({
  input: racine + "src/pc/travail.ts",
  platform: "node",
  logLevel: "warn",
  output: {
    file: sortie, format: "esm", minify: false,
    banner: `// Muninn sur le PC : travail en tâche de fond. VERSION = ${version}\n// Fichier construit par « npm run pc » depuis src/pc/travail.ts : ne pas le modifier à la main.`
  }
});
console.log("travail.mjs construit (version " + version + ") : " + sortie);
