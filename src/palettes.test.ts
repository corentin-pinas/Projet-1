import { describe, expect, it } from "vitest";
import { contraste, PALETTES } from "./palettes";

describe("palettes : tout reste lisible", () => {
  for (const [cle, p] of Object.entries(PALETTES)) {
    it(`${p.nom} (${cle})`, () => {
      expect(contraste(p.clair.accent, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);          // texte coloré sur blanc, texte blanc sur bouton
      expect(contraste(p.sombre.accent, p.sombre.panel)).toBeGreaterThanOrEqual(4.5);    // texte coloré sur fond sombre
      expect(contraste(p.sombre.accentInk, p.sombre.accent)).toBeGreaterThanOrEqual(4.5); // texte sur bouton en sombre
      expect(contraste("#E6EDEB", p.sombre.panel)).toBeGreaterThanOrEqual(7);           // texte courant en sombre
      expect(contraste(p.sombre.soft, p.sombre.panel)).toBeGreaterThanOrEqual(4.5);      // texte secondaire en sombre
    });
  }
});
