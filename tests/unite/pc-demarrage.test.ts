/* Muninn du PC : il doit redémarrer même si son fichier de données est abîmé (coupure pendant une écriture).
   Défaut E2 de l'audit du 3 novembre 2026. */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODE, changementsPC, demarrerPC, dossierPC, type PC } from "./pc";

const pcs: PC[] = [];
afterEach(async () => { for (const p of pcs.splice(0)) await p.arreter(); });

const base = (contenu: string, rev: number) => JSON.stringify({ rev, elements: { "seances/s1": { rev, valeur: { id: "s1", contenu } } } });
const contenuSurPC = async (pc: PC) => (await changementsPC(pc)).changements.find((c: { cle: string }) => c.cle === "seances/s1")?.valeur?.contenu;
async function demarre(d: string): Promise<PC> {
  const pc = await demarrerPC(d);
  expect("arret" in pc ? "arrêté au démarrage : " + pc.arret : "démarré").toBe("démarré");
  pcs.push(pc as PC);
  return pc as PC;
}

describe("Muninn du PC : démarrage sur un fichier abîmé", () => {
  it("donnees.json tronqué : met le fichier abîmé de côté et repart de la dernière copie lisible", async () => {
    const d = dossierPC();
    mkdirSync(join(d, "copies"), { recursive: true });
    writeFileSync(join(d, "copies", "2026-11-01.json"), base("copie du 1er", 3));
    writeFileSync(join(d, "copies", "2026-11-02.json"), base("copie du 2", 5));
    writeFileSync(join(d, "copies", "2026-11-03.json"), "{\"rev\":9,\"elem");     // copie elle-même abîmée
    writeFileSync(join(d, "donnees.json"), base("le plus récent", 7).slice(0, 30));
    const pc = await demarre(d);
    expect(await contenuSurPC(pc)).toBe("copie du 2");
    expect(readdirSync(d).some(n => n.startsWith("donnees.json.abime-"))).toBe(true);
    expect(readFileSync(join(d, "journal.log"), "utf8")).toContain("2026-11-02.json");
    expect(JSON.parse(readFileSync(join(d, "donnees.json"), "utf8")).rev).toBe(5);   // la base est réécrite, saine
  });

  it("donnees.json vide et .tmp complet : repart du .tmp (la coupure a eu lieu entre l'écriture et le renommage)", async () => {
    const d = dossierPC();
    writeFileSync(join(d, "donnees.json"), "");
    writeFileSync(join(d, "donnees.json.tmp"), base("dans le tmp", 8));
    const pc = await demarre(d);
    expect(await contenuSurPC(pc)).toBe("dans le tmp");
  });

  it("donnees.json absent et .tmp abîmé : repart de la dernière copie", async () => {
    const d = dossierPC();
    mkdirSync(join(d, "copies"), { recursive: true });
    writeFileSync(join(d, "copies", "2026-11-02.json"), base("copie du 2", 5));
    writeFileSync(join(d, "donnees.json.tmp"), "{\"rev\":");
    const pc = await demarre(d);
    expect(await contenuSurPC(pc)).toBe("copie du 2");
  });

  it("donnees.json sain : rien ne change", async () => {
    const d = dossierPC();
    writeFileSync(join(d, "donnees.json"), base("sain", 4));
    writeFileSync(join(d, "donnees.json.tmp"), "reste abîmé d'une ancienne écriture");
    const pc = await demarre(d);
    expect(await contenuSurPC(pc)).toBe("sain");
    expect(existsSync(join(d, "journal.log"))).toBe(false);
  });

  it("identité de la base : la même d'un démarrage à l'autre, nouvelle si la base repart d'un état plus ancien", async () => {
    const d = dossierPC();
    writeFileSync(join(d, "donnees.json"), base("sain", 4));
    let pc = await demarre(d);
    const etat = async () => (await fetch(pc.url + "/api/sync/etat", { headers: { Authorization: "Bearer " + CODE } })).json();
    const id1 = (await etat()).id;
    expect(id1).toBeTruthy();
    await pc.arreter(); pcs.splice(0);
    pc = await demarre(d);
    expect((await etat()).id).toBe(id1);
    // une modification passe le numéro à 5, puis on remet à la main une copie au numéro 4
    const r = await fetch(pc.url + "/api/sync/envoi", { method: "POST", headers: { Authorization: "Bearer " + CODE, "Content-Type": "application/json" },
      body: JSON.stringify({ changements: [{ cle: "seances/s2", rev: 0, valeur: { id: "s2" } }] }) });
    expect(r.ok).toBe(true);
    await pc.arreter(); pcs.splice(0);
    writeFileSync(join(d, "donnees.json"), base("copie remise à la main", 4));
    pc = await demarre(d);
    const e = await etat();
    expect(e.id).not.toBe(id1);
    expect(e.origine).toBe("reprise");
    expect(e.rev).toBe(5);                                                          // les numéros ne reculent jamais
    expect(readFileSync(join(d, "journal.log"), "utf8")).toContain("revenue en arrière");
  });

  it("premier démarrage (dossier vide) : base vide, sans message", async () => {
    const d = dossierPC();
    const pc = await demarre(d);
    expect((await changementsPC(pc)).changements).toEqual([]);
  });
});
