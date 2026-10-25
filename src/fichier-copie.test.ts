import { describe, expect, it } from "vitest";
import { chiffrer, dechiffrer, ErreurCopie } from "./fichier-copie";

const contenu = () => ({ entete: { patients: ["Marc D."] }, fichiers: [new Blob(["%PDF-1.4 bilan"]), new Blob([new Uint8Array([0, 1, 2, 255])])] });
const texte = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

describe("fichier de copie chiffré", () => {
  it("se relit avec le bon mot de passe, fichiers compris", async () => {
    const f = await chiffrer(contenu(), "mot de passe sûr", 1000);
    const r = await dechiffrer<{ patients: string[] }>(f, "mot de passe sûr");
    expect(r.entete).toEqual({ patients: ["Marc D."] });
    expect(await texte(r.fichiers[0])).toEqual(await texte(contenu().fichiers[0]));
    expect(await texte(r.fichiers[1])).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it("ne laisse rien lire en clair", async () => {
    const f = await chiffrer(contenu(), "mot de passe sûr", 1000);
    expect(new TextDecoder().decode(await f.arrayBuffer())).not.toContain("Marc");
  });

  it("refuse un mauvais mot de passe", async () => {
    const f = await chiffrer(contenu(), "mot de passe sûr", 1000);
    await expect(dechiffrer(f, "autre")).rejects.toMatchObject({ raison: "mot-de-passe" });
  });

  it("refuse un fichier qui n'est pas une copie, ou une copie tronquée", async () => {
    await expect(dechiffrer(new Blob(["%PDF-1.4"]), "x")).rejects.toBeInstanceOf(ErreurCopie);
    const f = await chiffrer(contenu(), "mot de passe sûr", 1000);
    await expect(dechiffrer(f.slice(0, f.size - 3), "mot de passe sûr")).rejects.toMatchObject({ raison: "abimee" });
  });
});
