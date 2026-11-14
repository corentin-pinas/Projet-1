/* Le PC fait le travail en tâche de fond (1.9.0, choix de Corentin du 14 novembre 2026) : le vrai muninn-pc.mjs avec le
   vrai travail.mjs, un faux serveur de l'appli (l'IA) et un faux Whisper. */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CODE, dossierPC, lancerPC, type PC } from "./pc";

const CODE_IA = "code-acces-essai-123";
let port = 5300;
const fermer: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const f of fermer.splice(0)) await f(); });

const lire = (req: IncomingMessage) => new Promise<Buffer>(ok => { const m: Buffer[] = []; req.on("data", d => m.push(d)); req.on("end", () => ok(Buffer.concat(m))); });
function serveur(gerer: (req: IncomingMessage, corps: Buffer) => { statut?: number; corps: unknown }): Promise<string> {
  const p = port++;
  const s: Server = createServer(async (req, res) => {
    const r = gerer(req, await lire(req));
    res.writeHead(r.statut ?? 200, { "Content-Type": "application/json" }); res.end(JSON.stringify(r.corps));
  });
  fermer.push(() => new Promise(r => s.close(() => r())));
  return new Promise(r => s.listen(p, "127.0.0.1", () => r(`http://127.0.0.1:${p}`)));
}

type Demande = { system: string; contenu: { text?: string }[]; schema: { required: string[] }; modele: string };
const seance = (o: Record<string, unknown> = {}) => ({ propre: "État du patient : douleur 2/10.\nFait en séance : mobilisations.", resume: null, bref: "Douleur 2/10.", rdv_date: null, rdv_heure: null, rdv_demi: null, rdv_autres: [], rdv_annules: [], objectifs: [], fin_traitement: false, ...o });

/* faux serveur de l'appli : note les demandes, répond par ce que le test prévoit */
async function fauxServeur(repondre: (d: Demande, n: number) => { statut?: number; corps: unknown }) {
  const recues: { auth: string; demande: Demande }[] = [];
  const url = await serveur((req, corps) => {
    const demande = JSON.parse(corps.toString("utf8")) as Demande;
    recues.push({ auth: String(req.headers.authorization), demande });
    return repondre(demande, recues.length);
  });
  return { url, recues };
}
async function fauxWhisper(texte = "avec Marc douleur 3 sur 10 renforcement des rotateurs pour la prochaine séance mardi") {
  const recus: { taille: number; indice: unknown }[] = [];
  const url = await serveur((req, corps) => {
    if (req.url === "/etat") return { corps: { pret: true } };
    recus.push({ taille: corps.length, indice: JSON.parse(decodeURIComponent(String(req.headers["x-muninn-indice"] || "%7B%7D"))) });
    return { corps: { texte } };
  });
  return { url, recus };
}

async function pcAvec(ia: string, voix: string, env: Record<string, string> = {}) {
  const pc = await lancerPC(dossierPC(), { MUNINN_IA_ADRESSE: ia, MUNINN_VOIX_URL: voix, MUNINN_TRAVAIL_DELAI_MS: "300", ...env });
  fermer.push(() => pc.arreter());
  return pc;
}
const auth = { Authorization: "Bearer " + CODE };
const api = async (pc: PC, chemin: string, init: RequestInit = {}) => {
  const r = await fetch(pc.url + chemin, { ...init, headers: { ...auth, ...init.headers } });
  return { statut: r.status, corps: await r.json() };
};
async function elements(pc: PC): Promise<Record<string, unknown>> {
  const r = await api(pc, "/api/sync/changements?depuis=0");
  return Object.fromEntries(r.corps.changements.filter((c: { supprime?: boolean }) => !c.supprime).map((c: { cle: string; valeur: unknown }) => [c.cle, c.valeur]));
}
async function poser(pc: PC, valeurs: Record<string, unknown>) {
  const r = await api(pc, "/api/sync/envoi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changements: Object.entries(valeurs).map(([cle, valeur]) => ({ cle, rev: 0, valeur })) }) });
  expect(r.corps.conflits).toEqual([]);
}
type T = { id: string; etat: string; erreur?: string; essais: number; texte?: string; seanceId?: string; ranges?: { dossierId: string; seanceId: string }[]; doutes?: unknown[]; rdvs?: string[]; rdvs_avant?: Record<string, unknown>; rdvs_apres?: Record<string, unknown> };
const travaux = async (pc: PC): Promise<T[]> => ((await elements(pc))["parametres/travaux"] as { travaux: T[] } | undefined)?.travaux ?? [];
async function attendre(pc: PC, id: string, etats: string[], ms = 15_000): Promise<T> {
  for (const fin = Date.now() + ms; Date.now() < fin;) {
    const t = (await travaux(pc)).find(x => x.id === id);
    if (t && etats.includes(t.etat)) return t;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("travail pas dans l'état attendu : " + JSON.stringify((await travaux(pc)).find(x => x.id === id)) + "\n" + pc.sortie());
}
const confier = (pc: PC, demande: Record<string, unknown>, son?: Buffer) => son
  ? api(pc, "/api/travail?demande=" + encodeURIComponent(JSON.stringify(demande)), { method: "POST", headers: { "Content-Type": "audio/webm", "X-Muninn-IA": CODE_IA }, body: son })
  : api(pc, "/api/travail", { method: "POST", headers: { "Content-Type": "application/json", "X-Muninn-IA": CODE_IA }, body: JSON.stringify({ demande }) });

const JOUR = "2026-11-16";   // un lundi
const demain = () => { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10); };
const marc = { id: "dos-marc", label: "Marc D.", rdvs: [{ d: JOUR, h: "", p: "am" }], homonyme: false, cree: "2026-10-01T08:00:00.000Z" };
const lea = { id: "dos-lea", label: "Léa P.", rdvs: [], homonyme: false, cree: "2026-10-01T08:00:00.000Z" };
const ID = "travail-0001-abcd";

describe("le PC fait le travail en tâche de fond", () => {
  it("public/pc/travail.mjs est bien construit depuis le code actuel (npm run pc)", () => {
    const sortie = join(mkdtempSync(join(tmpdir(), "muninn-travail-")), "travail.mjs");
    execFileSync(process.execPath, [resolve(__dirname, "../../scripts/pc-travail.mjs"), sortie]);
    expect(readFileSync(resolve(__dirname, "../../public/pc/travail.mjs"), "utf8")).toBe(readFileSync(sortie, "utf8"));
  });

  it("sans adresse du serveur de l'appli : le travail n'est pas proposé aux appareils", async () => {
    const pc = await lancerPC(dossierPC());
    fermer.push(() => pc.arreter());
    expect((await api(pc, "/api/sync/etat")).corps.travail).toMatchObject({ version: 1, pret: false });
    expect((await confier(pc, { id: ID, type: "dictee", date: JOUR, texte: "x" })).statut).toBe(503);
    expect(await (await fetch(pc.url + "/sante")).json()).toEqual({ pc: 8, travail: 1 });
  });

  it("dictée tapée : rangée par le PC dans la base commune, récapitulatif dans le travail, code d'accès gardé", async () => {
    const dictee = "Avec Marc, douleur 3 sur 10, renforcement des rotateurs externes, pour la prochaine séance demain le matin. Ensuite Bernard, massage.";
    const ia = await fauxServeur(() => ({ corps: { donnees: { seances: [
      { nom: "Marc D.", extrait: "douleur 3 sur 10, renforcement des rotateurs externes, pour la prochaine séance demain le matin.", ...seance({ rdv_date: demain(), rdv_demi: "matin", resume: "Tester la force." }) },
      { nom: "Bernard", extrait: "massage.", ...seance({ propre: "Fait en séance : massage." }) }
    ] } } }));
    const pc = await pcAvec(ia.url, "http://127.0.0.1:1");
    await poser(pc, { "dossiers/dos-marc": marc, "dossiers/dos-lea": lea });
    expect((await api(pc, "/api/sync/etat")).corps.travail).toMatchObject({ version: 1, pret: true });
    const r = await confier(pc, { id: ID, type: "dictee", date: JOUR, texte: dictee, appareil: "tablette" });
    expect(r.statut).toBe(200);
    expect(r.corps.travail).toMatchObject({ id: ID, etat: "attente" });
    const t = await attendre(pc, ID, ["fini"]);
    expect(ia.recues[0].auth).toBe("Bearer " + CODE_IA);
    expect(ia.recues[0].demande.modele).toBe("opus");
    expect(ia.recues[0].demande.contenu[0].text).toContain("Marc D. (rendez-vous ce jour-là)");
    const el = await elements(pc);
    const s = el["seances/" + t.ranges![0].seanceId] as { dossierId: string; contenu: string; propre: string; ia_ok: boolean; avenir_resume: string };
    expect(s).toMatchObject({ dossierId: "dos-marc", ia_ok: true, avenir_resume: "Tester la force." });
    expect(s.propre).toContain("douleur 2/10");
    expect((el["dossiers/dos-marc"] as typeof marc).rdvs).toEqual([{ d: JOUR, h: "", p: "am" }, { d: demain(), h: "", p: "am" }].sort((x, y) => x.d.localeCompare(y.d)));
    expect(t.rdvs![0]).toMatch(/^Rendez-vous repéré pour Marc D\. : \S+ \d+ \S+ matin\.$/);   // le jour écrit en entier (lu plus tard)
    expect(t.rdvs_avant).toEqual({ "dos-marc": marc.rdvs });
    expect(t.doutes).toHaveLength(1);                                       // « Bernard » : patient inconnu, à ranger à la main
    expect(JSON.parse(readFileSync(join(pc.dossier, "ia.json"), "utf8"))).toEqual({ code: CODE_IA });
    // la même demande renvoyée (réseau coupé avant la réponse) ne fait pas un second travail
    expect((await confier(pc, { id: ID, type: "dictee", date: JOUR, texte: dictee })).corps.travail.etat).toBe("fini");
    expect(ia.recues).toHaveLength(1);
  });

  it("dictée à la voix : transcrite par le Whisper du PC (patients du jour en indice), gardée, rangée ; le son est effacé", async () => {
    const ia = await fauxServeur(d => ({ corps: { donnees: { seances: [{ nom: "Marc D.", extrait: d.contenu[0].text!.split("Dictée :\n")[1].replace(/^avec Marc /, ""), ...seance() }] } } }));
    const voix = await fauxWhisper();
    const pc = await pcAvec(ia.url, voix.url);
    await poser(pc, { "dossiers/dos-marc": marc });
    const r = await confier(pc, { id: ID, type: "dictee", date: JOUR, debut: "Tapé avant :" }, Buffer.alloc(5000, 1));
    expect(r.statut).toBe(200);
    const t = await attendre(pc, ID, ["fini"]);
    expect(voix.recus).toEqual([{ taille: 5000, indice: { noms: ["Marc D."], avant: "" } }]);
    expect(t.texte).toBe("Tapé avant :\navec Marc douleur 3 sur 10 renforcement des rotateurs pour la prochaine séance mardi");
    const el = await elements(pc);
    expect((el["parametres/dictees"] as { dictees: { date: string; texte: string }[] }).dictees).toMatchObject([{ date: JOUR, texte: t.texte }]);
    expect(t.ranges).toHaveLength(1);
    expect(readdirSync(join(pc.dossier, "travaux"))).toEqual([]);
  });

  it("serveur de l'appli injoignable : nouvel essai tout seul, puis rangé ; erreur définitive (code refusé) : arrêt, avec le message", async () => {
    let panne = true;
    const ia = await fauxServeur(() => panne ? { statut: 502, corps: { erreur: "Claude n'a pas répondu.", nature: "passager" } } : { corps: { donnees: seance() } });
    const pc = await pcAvec(ia.url, "http://127.0.0.1:1", { MUNINN_TRAVAIL_DELAI_MS: "1500" });
    const s1 = { id: "seance-1", dossierId: "dos-lea", date: JOUR, contenu: "douleur deux sur dix mobilisations", cree: "2026-11-16T09:00:00.000Z" };
    await poser(pc, { "dossiers/dos-lea": lea, "seances/seance-1": s1 });
    await confier(pc, { id: ID, type: "analyse", date: JOUR, seanceId: "seance-1" });
    const enAttente = await attendre(pc, ID, ["attente"]);
    if (!enAttente.erreur) await new Promise(r => setTimeout(r, 300));
    const t1 = (await travaux(pc)).find(x => x.id === ID)!;
    expect(t1).toMatchObject({ etat: "attente", erreur: "Claude n'a pas répondu.", essais: 1 });
    panne = false;
    const fini = await attendre(pc, ID, ["fini"]);
    expect(fini.essais).toBe(2);
    expect((await elements(pc))["seances/seance-1"]).toMatchObject({ ia_ok: true, bref: "Douleur 2/10." });

    const ia2 = await fauxServeur(() => ({ statut: 401, corps: { erreur: "Code d'accès refusé.", nature: "definitif" } }));
    const pc2 = await pcAvec(ia2.url, "http://127.0.0.1:1");
    await poser(pc2, { "dossiers/dos-lea": lea, "seances/seance-1": s1 });
    await confier(pc2, { id: ID, type: "analyse", date: JOUR, seanceId: "seance-1" });
    expect(await attendre(pc2, ID, ["erreur"])).toMatchObject({ erreur: "Code d'accès refusé.", essais: 1 });
  });

  it("séance dite à la voix sur une fiche : enregistrée telle que dite, puis mise au propre (rendez-vous posé)", async () => {
    const ia = await fauxServeur(() => ({ corps: { donnees: seance({ rdv_date: demain(), rdv_demi: null }) } }));
    const voix = await fauxWhisper("douleur deux sur dix mobilisations dans une semaine");
    const pc = await pcAvec(ia.url, voix.url);
    await poser(pc, { "dossiers/dos-lea": lea });
    await confier(pc, { id: ID, type: "seance", date: JOUR, dossierId: "dos-lea", debut: "Patiente en forme." }, Buffer.alloc(800, 2));
    const t = await attendre(pc, ID, ["fini"]);
    expect(voix.recus[0].indice).toEqual({ noms: ["Léa P."], avant: "" });
    const s = (await elements(pc))["seances/" + t.seanceId] as { contenu: string; propre: string; dossierId: string };
    expect(s).toMatchObject({ dossierId: "dos-lea", contenu: "Patiente en forme.\ndouleur deux sur dix mobilisations dans une semaine" });
    expect(s.propre).toContain("douleur 2/10");
    expect(((await elements(pc))["dossiers/dos-lea"] as typeof lea).rdvs).toEqual([{ d: demain(), h: "" }]);
    expect(ia.recues[0].demande.modele).toBe("sonnet");
  });

  it("séance modifiée sur un appareil avant d'être mise au propre : le PC n'y touche pas ; séance pas encore arrivée : attendue", async () => {
    const ia = await fauxServeur(() => ({ corps: { donnees: seance() } }));
    const pc = await pcAvec(ia.url, "http://127.0.0.1:1");
    await poser(pc, { "dossiers/dos-lea": lea, "seances/seance-1": { id: "seance-1", dossierId: "dos-lea", date: JOUR, contenu: "texte modifié depuis", cree: "x" } });
    await confier(pc, { id: ID, type: "analyse", date: JOUR, seanceId: "seance-1", empreinte: "#autre" });
    await attendre(pc, ID, ["fini"]);
    expect(ia.recues).toHaveLength(0);
    // séance confiée avant d'être arrivée sur le PC : attendue, puis mise au propre dès qu'elle arrive
    await confier(pc, { id: "travail-0002-abcd", type: "analyse", date: JOUR, seanceId: "seance-2" });
    expect(await attendre(pc, "travail-0002-abcd", ["attente"])).toMatchObject({ etat: "attente" });
    await poser(pc, { "seances/seance-2": { id: "seance-2", dossierId: "dos-lea", date: JOUR, contenu: "mobilisations", cree: "x" } });
    await attendre(pc, "travail-0002-abcd", ["fini"]);
    expect((await elements(pc))["seances/seance-2"]).toMatchObject({ ia_ok: true });
    expect(existsSync(join(pc.dossier, "donnees.json"))).toBe(true);
  });
});
