import { describe, expect, it } from "vitest";
import { jourAnniversaire, niveauNoel, paques, saisonDu } from "./saisons";

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

describe("Pâques, anniversaire, Noël qui monte en puissance", () => {
  it("calcule Pâques", () => {
    expect(paques(2026).toDateString()).toBe(new Date(2026, 3, 5).toDateString());
    expect(paques(2027).toDateString()).toBe(new Date(2027, 2, 28).toDateString());
  });
  it("Pâques : des Rameaux au lundi de Pâques", () => {
    expect(saisonDu(jour("2026-03-28"))).toBeNull();
    expect(saisonDu(jour("2026-03-29"))).toBe("paques");
    expect(saisonDu(jour("2026-04-06"))).toBe("paques");
    expect(saisonDu(jour("2026-04-07"))).toBeNull();
  });
  it("anniversaire de Corentin : du 10 au 16 mars, avant Pâques s'ils se chevauchent", () => {
    expect(saisonDu(jour("2027-03-09"))).toBeNull();
    expect(saisonDu(jour("2027-03-10"))).toBe("anniversaire");
    expect(saisonDu(jour("2027-03-16"))).toBe("anniversaire");
    expect(jourAnniversaire(jour("2027-03-13"))).toBe(true);
    expect(jourAnniversaire(jour("2027-03-14"))).toBe(false);
    expect(saisonDu(jour("2008-03-16"))).toBe("anniversaire");   // en 2008, les Rameaux tombaient le 16 mars
  });
  it("Noël : de plus en plus au fil de décembre", () => {
    expect(["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-20", "2026-12-24", "2026-12-26"].map(d => niveauNoel(jour(d)))).toEqual([1, 2, 3, 4, 5, 5]);
    expect(niveauNoel(jour("2026-11-30"))).toBe(0);
  });
});
