import { describe, expect, it } from "vitest";
import { formatOctets, verifications, type EtatAppareil } from "./verifications";

const tout: EtatAppareil = { installee: true, horsConnexionPret: true, stockageProtege: true, espaceLibre: 8e9 };

describe("formatOctets", () => {
  it("écrit les tailles à la française", () => {
    expect(formatOctets(12_400_000_000)).toBe("12,4 Go");
    expect(formatOctets(350_000_000)).toBe("350 Mo");
    expect(formatOctets(4_200)).toBe("4 ko");
  });
});

describe("verifications", () => {
  it("tout est au vert sur une tablette bien installée", () => {
    expect(verifications(tout).every(v => v.ok)).toBe(true);
  });

  it("explique comment installer quand l'appli est ouverte dans le navigateur", () => {
    const v = verifications({ ...tout, installee: false }).find(v => v.id === "installee")!;
    expect(v.ok).toBe(false);
    expect(v.detail).toContain("Ajouter à l'écran d'accueil");
  });

  it("ne déclare pas le stockage protégé quand le navigateur ne sait pas répondre", () => {
    const v = verifications({ ...tout, stockageProtege: null }).find(v => v.id === "stockage")!;
    expect(v.ok).toBe(false);
    expect(v.detail).toContain("ne permet pas");
  });

  it("signale un espace trop juste", () => {
    const v = verifications({ ...tout, espaceLibre: 200e6 }).find(v => v.id === "espace")!;
    expect(v.ok).toBe(false);
    expect(v.detail).toBe("200 Mo disponibles pour les bilans et les séances.");
  });
});
