import { describe, expect, it } from "vitest";
import { aPrevenir } from "./alerte-code";

describe("alerte des mauvais codes d'accès", () => {
  it("prévient dès 3 mauvais codes en 24 heures, pas avant", () => {
    expect(aPrevenir({ n: 2, dernier: "2026-11-06T10:00:00.000Z" }, undefined)).toBe(false);
    expect(aPrevenir({ n: 3, dernier: "2026-11-06T10:00:00.000Z" }, undefined)).toBe(true);
    expect(aPrevenir(undefined, undefined)).toBe(false);
  });
  it("« C'est moi » fait taire l'alerte jusqu'au prochain mauvais code", () => {
    expect(aPrevenir({ n: 3, dernier: "2026-11-06T10:00:00.000Z" }, "2026-11-06T10:00:00.000Z")).toBe(false);
    expect(aPrevenir({ n: 4, dernier: "2026-11-06T11:00:00.000Z" }, "2026-11-06T10:00:00.000Z")).toBe(true);
  });
});
