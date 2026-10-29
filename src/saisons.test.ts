import { describe, expect, it } from "vitest";
import { saisonDu } from "./saisons";

const jour = (iso: string) => new Date(iso + "T10:00:00");

describe("décorations de saison", () => {
  it("Halloween : la semaine d'avant jusqu'au 1er novembre", () => {
    expect(saisonDu(jour("2026-10-23"))).toBeNull();
    expect(saisonDu(jour("2026-10-24"))).toBe("halloween");
    expect(saisonDu(jour("2026-10-31"))).toBe("halloween");
    expect(saisonDu(jour("2026-11-01"))).toBe("halloween");
    expect(saisonDu(jour("2026-11-02"))).toBeNull();
  });
  it("Noël : du 1er au 26 décembre", () => {
    expect(saisonDu(jour("2026-11-30"))).toBeNull();
    expect(saisonDu(jour("2026-12-01"))).toBe("noel");
    expect(saisonDu(jour("2026-12-26"))).toBe("noel");
    expect(saisonDu(jour("2026-12-27"))).toBeNull();
  });
});
