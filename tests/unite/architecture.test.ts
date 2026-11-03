/* Architecture : les modules de src/ ne doivent jamais dépendre les uns des autres en boucle,
   et les règles pures (regles, fusion…) ne dépendent de rien. Voir README.md, « Architecture ». */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../../src");
const modules = readdirSync(SRC).filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts")).map(f => f.slice(0, -3));
const deps = new Map(modules.map(m => {
  const t = readFileSync(join(SRC, m + ".ts"), "utf8");
  const d = new Set<string>();
  for (const x of t.matchAll(/(?:from\s+|import\(\s*)["']\.\/([\w-]+)["']/g)) d.add(x[1]);
  return [m, [...d]];
}));

function boucles(): string[] {
  const trouvees = new Set<string>();
  const visiter = (m: string, chemin: string[]) => {
    for (const d of deps.get(m) ?? []) {
      const i = chemin.indexOf(d);
      if (i >= 0) trouvees.add([...chemin.slice(i), d].join(" → "));
      else visiter(d, [...chemin, d]);
    }
  };
  for (const m of modules) visiter(m, [m]);
  return [...trouvees];
}

describe("architecture du code", () => {
  it("aucune dépendance circulaire entre les modules", () => {
    expect(modules.length).toBeGreaterThan(20);
    expect(boucles()).toEqual([]);
  });

  it("les règles pures ne dépendent d'aucun autre module", () => {
    for (const m of ["regles", "fusion", "palettes", "saisons", "pdf", "ui", "fichier-copie", "verifications"])
      expect([m, deps.get(m)]).toEqual([m, []]);
  });

  it("seul main.ts (le démarrage) dépend de app.ts", () => {
    expect(modules.filter(m => deps.get(m)!.includes("app"))).toEqual(["main"]);
  });
});
