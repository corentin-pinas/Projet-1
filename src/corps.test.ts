import { describe, expect, it } from "vitest";
import { formeSur, miroirChemin, PLANCHES, STRUCTURES, vueParDefaut, vuesRegion, zonesActives, zonesAnciennes, zonesDeSeance, zonesDuBilan, type Zone } from "./corps";

const Q = "2026-11-22T10:00:00Z";
describe("carte du corps", () => {
  it("chaque structure est dessinée quelque part et dans le cadre de sa planche", () => {
    for (const [k, s] of Object.entries(STRUCTURES)) {
      const pl = Object.keys(s.dessins);
      expect([k, pl.length > 0]).toEqual([k, true]);
      for (const p of pl) { const f = s.dessins[p]!, P = PLANCHES[p]; expect([k, p, f.x >= 0 && f.x <= P.l && f.y >= 0 && f.y <= P.h]).toEqual([k, p, true]); }
    }
  });
  it("côté gauche : miroir sur les planches Servier ; profil : seulement le côté montré", () => {
    expect(formeSur("deltoide_post", "dos", "g")!.x).toBeCloseTo(218 - 165);
    expect(formeSur("masseter", "tete-d", "d")).not.toBeNull();
    expect(formeSur("masseter", "tete-d", "g")).toBeNull();
    expect(miroirChemin("M10 20 L30 40 Z", 100)).toBe("M90 20 L70 40 Z");
  });
  it("cadres des vues : toujours dans la planche (rien n'est coupé)", () => {
    for (const r of ["tete", "cou", "epaule", "bras", "coude", "main", "dos", "hanche", "genou", "cheville", "corps"]) for (const c of ["d", "g", "c"] as const)
      for (const v of vuesRegion(r, c)) { const P = PLANCHES[v.planche], [x, y, l, h] = v.cadre; expect([r, c, v.planche, x >= 0 && y >= 0 && x + l <= P.l + 0.5 && y + h <= P.h + 0.5]).toEqual([r, c, v.planche, true]); }
  });
  it("bilan : zones ajoutées, jamais celles enlevées à la main (votre geste fait foi)", () => {
    const enlevee: Zone = { id: "masseter|d|pain", structure: "masseter", cote: "d", cat: "pain", nom: "Masséter droit", depuis: "2026-10-30", source: "bilan", enlevee: "2026-11-01", maj: Q };
    const zs = zonesDuBilan([enlevee], [{ structure: "masseter", cote: "d", cat: "pain", nom: "masséter" }, { structure: "temporal", cote: "d", cat: "raide", nom: "temporal droit" }, { structure: "inconnu", cote: "d", cat: "pain", nom: "?" }], "2026-11-20", Q);
    expect(zs.map(z => z.id)).toEqual(["masseter|d|pain", "temporal|d|raide"]);
    expect(zs[0].enlevee).toBe("2026-11-01");
  });
  it("séance : ajout, « moins de douleur » pâlit, « plus de douleur » passe dans les anciennes", () => {
    let zs = zonesDeSeance([], [{ structure: "dorsales", cote: "c", cat: "pain", nom: "douleur dorsale", action: "ajout" }], "2026-11-20", Q);
    expect(zonesActives(zs)).toHaveLength(1);
    zs = zonesDeSeance(zs, [{ structure: "dorsales", cote: "c", cat: "pain", nom: "", action: "mieux" }], "2026-11-24", Q);
    expect(zs[0].mieux).toBe("2026-11-24");
    zs = zonesDeSeance(zs, [{ structure: "dorsales", cote: "c", cat: "pain", nom: "", action: "fini" }], "2026-11-27", Q);
    expect(zonesActives(zs)).toHaveLength(0);
    expect(zonesAnciennes(zs)[0].fin).toBe("2026-11-27");
  });
  it("vue par défaut : une région agrandie ; plusieurs régions ou un nerf : le corps entier", () => {
    const z = (structure: string, cote: "d" | "g" | "c" = "d"): Zone => ({ id: structure, structure, cote, cat: "pain", nom: "", depuis: "", source: "bilan", maj: Q });
    expect(vueParDefaut([z("deltoide_post"), z("sus_epineux")])).toEqual({ region: "epaule", cote: "d" });
    expect(vueParDefaut([z("masseter"), z("dorsales", "c")]).region).toBe("corps");
    expect(vueParDefaut([z("lombaires", "c"), z("nerf_sciatique")]).region).toBe("corps");
  });
});
