/* Muninn du PC : durée de garde (choix de Corentin du 7 novembre 2026). Un élément supprimé reste récupérable 30 jours
   (ancienne version, PDF), puis il est effacé définitivement ; un bilan vivant garde toujours ses fichiers. */
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODE, demarrerPC, dossierPC, type PC } from "./pc";

const pcs: PC[] = [];
afterEach(async () => { for (const p of pcs.splice(0)) await p.arreter(); });
const ilYa = (j: number) => new Date(Date.now() - j * 864e5);

describe("Muninn du PC : effacement définitif après 30 jours", () => {
  it("efface l'ancienne version et le PDF d'un bilan supprimé il y a plus de 30 jours, garde le reste", async () => {
    const d = dossierPC();
    mkdirSync(join(d, "fichiers"), { recursive: true });
    for (const f of ["vieux", "recent", "vivant", "orphelin-neuf"]) { writeFileSync(join(d, "fichiers", f), "pdf"); writeFileSync(join(d, "fichiers", f + ".type"), "application/pdf"); }
    for (const f of ["vieux", "recent", "vivant"]) utimesSync(join(d, "fichiers", f), ilYa(60), ilYa(60));
    writeFileSync(join(d, "donnees.json"), JSON.stringify({ rev: 4, id: "x", origine: "neuve", elements: {
      "bilans/b1": { rev: 1, supprime: true, quand: ilYa(31).toISOString(), ancien: { id: "b1", fichiers: [{ id: "vieux" }] } },
      "bilans/b2": { rev: 2, supprime: true, quand: ilYa(5).toISOString(), ancien: { id: "b2", fichiers: [{ id: "recent" }] } },
      "bilans/b3": { rev: 3, valeur: { id: "b3", fichiers: [{ id: "vivant" }] } },
      "seances/s1": { rev: 4, supprime: true, ancien: { id: "s1", contenu: "supprimée avant cette version" } }
    } }));
    const pc = await demarrerPC(d);
    expect("arret" in pc).toBe(false);
    pcs.push(pc as PC);
    const base = JSON.parse(readFileSync(join(d, "donnees.json"), "utf8"));
    expect(base.elements["bilans/b1"]).toMatchObject({ supprime: true });
    expect(base.elements["bilans/b1"].ancien).toBeUndefined();                       // plus de 30 jours : effacée
    expect(base.elements["bilans/b2"].ancien.id).toBe("b2");                          // 5 jours : encore récupérable
    expect(base.elements["seances/s1"].ancien.contenu).toBe("supprimée avant cette version");   // ancienne suppression : 30 jours à partir de maintenant
    expect(base.elements["seances/s1"].quand).toBeTruthy();
    expect(existsSync(join(d, "fichiers", "vieux"))).toBe(false);
    expect(existsSync(join(d, "fichiers", "vieux.type"))).toBe(false);
    expect(existsSync(join(d, "fichiers", "recent"))).toBe(true);
    expect(existsSync(join(d, "fichiers", "vivant"))).toBe(true);
    expect(existsSync(join(d, "fichiers", "orphelin-neuf"))).toBe(true);              // arrivé depuis moins de 2 jours : son bilan peut être en route
    expect(readFileSync(join(d, "journal.log"), "utf8")).toContain("1 ancienne(s) version(s), 1 fichier(s)");
  });

  it("une suppression envoyée par un appareil est datée ; les copies quotidiennes sont gardées 30 jours", async () => {
    const d = dossierPC();
    mkdirSync(join(d, "copies"), { recursive: true });
    for (let i = 1; i <= 35; i++) writeFileSync(join(d, "copies", `2026-01-${String(i).padStart(2, "0")}.json`.replace("-01-3", "-02-0")), JSON.stringify({ rev: 1, elements: {} }));
    writeFileSync(join(d, "donnees.json"), JSON.stringify({ rev: 1, id: "x", origine: "neuve", elements: { "seances/s1": { rev: 1, valeur: { id: "s1" } } } }));
    const pc = await demarrerPC(d) as PC;
    pcs.push(pc);
    const r = await (await fetch(pc.url + "/api/sync/envoi", { method: "POST", headers: { Authorization: "Bearer " + CODE, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "x", changements: [{ cle: "seances/s1", rev: 1, supprime: true }] }) })).json();
    expect(r.acceptes).toHaveLength(1);
    const base = JSON.parse(readFileSync(join(d, "donnees.json"), "utf8"));
    expect(base.elements["seances/s1"]).toMatchObject({ supprime: true, ancien: { id: "s1" } });
    expect(Date.now() - Date.parse(base.elements["seances/s1"].quand)).toBeLessThan(60_000);
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(d, "copies")).filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))).toHaveLength(30);
  });
});
