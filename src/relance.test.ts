import { describe, expect, it } from "vitest";
import { ErreurIA } from "./ia";
import { apresEchec, DELAI_RELANCE, rebours } from "./relance";

describe("relances automatiques", () => {
  const t = 1_000_000;
  it("serveur, PC ou IA sans réponse : nouvel essai 5 minutes plus tard, 3 essais au plus", () => {
    const e = new ErreurIA("Le serveur de l'appli n'a pas répondu à temps.", "passager");
    expect(apresEchec(e, 1, t)).toEqual({ essai: 2, quand: t + DELAI_RELANCE, cause: "Le serveur de l'appli n'a pas répondu à temps." });
    expect(apresEchec(e, 2, t)?.essai).toBe(3);
    expect(apresEchec(e, 3, t)).toBeNull();
  });
  it("la cause ne dit plus « Réessayez plus tard » puisque Muninn réessaie lui-même", () => {
    expect(apresEchec(new ErreurIA("L'IA est momentanément indisponible. Réessayez plus tard.", "passager"), 1, t)?.cause).toBe("L'IA est momentanément indisponible.");
  });
  it("pas de réseau : nouvel essai dès son retour", () => {
    expect(apresEchec(new ErreurIA("Pas de connexion à internet.", "reseau"), 1, t)?.quand).toBeNull();
  });
  it("quota atteint, code refusé, réglage manquant : pas de relance", () => {
    expect(apresEchec(new ErreurIA("La limite d'utilisation de l'abonnement est atteinte.", "definitif"), 1, t)).toBeNull();
    expect(apresEchec(new ErreurIA("Réglez d'abord l'IA."), 1, t)).toBeNull();   // définitive par défaut
  });
  it("compte à rebours lisible", () => {
    expect(rebours(272_000)).toBe("4 min 32 s");
    expect(rebours(9_000)).toBe("9 s");
    expect(rebours(-5)).toBe("0 s");
  });
});
