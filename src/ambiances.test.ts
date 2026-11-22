import { describe, expect, it } from "vitest";
import { AMBIANCES } from "./ambiances";
import { contraste } from "./palettes";

describe("ambiances : tout reste lisible", () => {
  for (const [cle, a] of Object.entries(AMBIANCES)) {
    it(`${a.nom} (${cle})`, () => {
      expect(contraste(a.ink, a.panel)).toBeGreaterThanOrEqual(7);           // texte courant
      expect(contraste(a.ink, a.bg)).toBeGreaterThanOrEqual(7);
      expect(contraste(a.soft, a.panel)).toBeGreaterThanOrEqual(4.5);        // texte secondaire
      expect(contraste(a.accent, a.panel)).toBeGreaterThanOrEqual(4.5);      // texte coloré
      expect(contraste(a.accent, a.accentBg)).toBeGreaterThanOrEqual(4.5);   // pastille colorée
      expect(contraste(a.accentInk, a.accent)).toBeGreaterThanOrEqual(4.5);  // texte sur bouton
      expect(contraste(a.accentInk, a.accent2)).toBeGreaterThanOrEqual(4.5); // texte sur l'autre bout du dégradé
      expect(contraste(a.warn, a.warnBg)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(a.warn, a.panel)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
