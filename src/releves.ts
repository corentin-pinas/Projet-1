/* Relevé des séances (2.2.0, Muninn Suivi étape 1, choix de Corentin du 22 novembre 2026).
   À chaque séance, la même demande que la mise au propre rend aussi ce que la note dit de l'évolution du patient :
   douleur, amplitudes, sommeil, force, exercices à la maison… en chiffres ou en mots. Rien n'est deviné :
   - un relevé sans la phrase de la note qui le dit (85 % de ses mots dans la note) est refusé ;
   - un chiffre absent de la note est retiré ;
   - non dit = rien (un trou), jamais une valeur par défaut.
   Règles pures (aucun accès à la base, ni à l'écran) : utilisées par ia.ts, rangement.ts (appareil et PC) et l'écran. */
import { memeSource, type Exo, type Releve, type Seance, type Sens } from "./regles";

export type Critere = { cle: string; nom: string; u?: string; douleur?: boolean };
/* liste de départ (épaule, mâchoire, pour tous) ; un critère dit qui n'y est pas est gardé sous le nom donné */
export const CRITERES: Critere[] = [
  { cle: "douleur", nom: "Douleur", u: "/10", douleur: true },
  { cle: "douleur_nuit", nom: "Douleur la nuit", u: "/10", douleur: true },
  { cle: "douleur_repos", nom: "Douleur au repos", u: "/10", douleur: true },
  { cle: "douleur_mouvement", nom: "Douleur au mouvement", u: "/10", douleur: true },
  { cle: "sommeil", nom: "Sommeil" },
  { cle: "exercices", nom: "Exercices" },
  { cle: "reprise", nom: "Reprise travail / sport" },
  { cle: "ressenti", nom: "Ressenti global" },
  { cle: "elevation", nom: "Élévation", u: "°" },
  { cle: "abduction", nom: "Abduction", u: "°" },
  { cle: "rotation_externe", nom: "Rotation externe", u: "°" },
  { cle: "rotation_interne", nom: "Rotation interne", u: "°" },
  { cle: "main_dos", nom: "Main-dos" },
  { cle: "force", nom: "Force" },
  { cle: "gestes", nom: "Gestes du quotidien" },
  { cle: "ouverture", nom: "Ouverture de bouche", u: "mm" },
  { cle: "diduction", nom: "Diduction", u: "mm" },
  { cle: "propulsion", nom: "Propulsion", u: "mm" },
  { cle: "bruits", nom: "Bruits articulaires" },
  { cle: "blocage", nom: "Blocages" },
  { cle: "mastication", nom: "Douleur à la mastication", u: "/10", douleur: true },
  { cle: "cephalees", nom: "Maux de tête" },
  { cle: "serrement", nom: "Serrement des dents" }
];
const PAR_CLE = new Map(CRITERES.map(c => [c.cle, c] as const));
export const critere = (c: string): Critere => PAR_CLE.get(c) ?? { cle: c, nom: c.charAt(0).toUpperCase() + c.slice(1) };

export const EXO_FR: Record<Exo, string> = { fait: "faits", partie: "en partie", pas: "pas faits" };
export const SENS_FR: Record<Sens, string> = { mieux: "mieux", pareil: "pareil", moins: "moins bien" };

/* ---------- ce qui est demandé à l'IA ---------- */

const nul = (t: Record<string, unknown>) => ({ anyOf: [t, { type: "null" }] });
export const SCHEMA_RELEVES = { type: "array", items: { type: "object", additionalProperties: false,
  required: ["critere", "valeur", "unite", "mot", "sens", "exercices", "detail", "phrase"],
  properties: {
    critere: { type: "string" }, valeur: nul({ type: "number" }), unite: nul({ type: "string" }), mot: nul({ type: "string" }),
    sens: nul({ type: "string", enum: ["mieux", "pareil", "moins"] }), exercices: nul({ type: "string", enum: ["fait", "partie", "pas"] }),
    detail: nul({ type: "string" }), phrase: { type: "string" }
  } } };

export const CONSIGNE_RELEVES =
  "ce que la note dit de l'état et de l'évolution du patient, un critère par item, pour suivre son évolution d'une séance à l'autre. " +
  "critere : une de ces clés si elle convient (" + CRITERES.map(c => c.cle).join(", ") + "), sinon un nom court en français, en minuscules. " +
  "valeur : le nombre seulement s'il est dit dans la note (douleur sur 10, degrés, millimètres…), sinon null ; ne calcule et ne déduis jamais un nombre. unite : « /10 », « ° », « mm », « cm », « kg » ou null. " +
  "mot : la valeur dite en mots quand il n'y a pas de nombre (« mieux », « se réveille encore la nuit », « reprise du travail »), 6 mots au plus, sinon null. " +
  "sens : « mieux », « pareil » ou « moins » seulement si la note compare à avant (« moins de douleur », « inchangé », « ça stagne », « plus de douleur »), sinon null. " +
  "exercices (seulement pour le critère exercices, les exercices à la maison depuis la dernière séance) : « fait », « partie » (en partie, arrêtés en route, irrégulier) ou « pas » ; detail : ce qui est dit de leur réalisation (avec ou sans douleur, ça aggrave, trop fait, sans application, exercices changés), 12 mots au plus, sinon null. " +
  "phrase : le passage de la note qui le dit, recopié mot pour mot, court. " +
  "Pas ce qui est prévu, ni les exercices donnés pour la suite, ni ce que le kinésithérapeute a fait en séance (sauf une mesure prise en séance : « 140° en actif »). [] si la note ne dit rien de l'évolution.";

/* corrections faites par Corentin sur des relevés précédents, rappelées à l'IA comme exemples (les 8 dernières) */
export function exemplesReleves(seances: Seance[]): string[] {
  return seances.filter(s => s.releves_corr?.length).sort((a, b) => b.cree.localeCompare(a.cree))
    .flatMap(s => s.releves_corr!.map(c => `« ${c.phrase} » : relevé « ${c.avant} », corrigé en « ${c.apres} »`)).slice(0, 8);
}
export const texteExemples = (ex: string[] = []) => ex.length
  ? "\n\nCorrections faites par le kinésithérapeute sur des relevés précédents (fais de même) :\n" + ex.map(x => "- " + x.slice(0, 300)).join("\n") : "";

/* ---------- lecture de la réponse, avec les garde-fous ---------- */

const sansAccent = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const motsDe = (t: string) => sansAccent(t).match(/[a-z0-9]+/g) ?? [];
const EN_LETTRES = ["zero", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf", "vingt"];

/* le nombre est-il écrit dans la note ? en chiffres (« 140° », « 4,5 », « 32mm »), ou en lettres jusqu'à vingt */
export function nombreDit(n: number, texte: string): boolean {
  const t = sansAccent(texte);
  const formes = Number.isInteger(n) ? [String(n)] : [String(n), String(n).replace(".", ",")];
  if (formes.some(f => new RegExp(`(?<![\\d.,])${f.replace(".", "\\.")}(?![\\d]|[.,]\\d)`).test(t))) return true;
  if (Number.isInteger(n) && n >= 0 && n <= 20) return new RegExp(`(?<![a-z-])${EN_LETTRES[n]}(?![a-z-])`).test(t);
  if (n % 1 === 0.5 && n < 20) return new RegExp(`(?<![a-z-])${EN_LETTRES[Math.floor(n)]} et demi`).test(t);
  return false;
}

const court = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : undefined;

export function lireReleves(x: unknown, contenu: string): Releve[] {
  if (!Array.isArray(x) || !contenu.trim()) return [];
  const dans = new Set(motsDe(contenu)), vus = new Set<string>(), out: Releve[] = [];
  for (const e of x) {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const brut = court(o.critere, 40);
    const phrase = court(o.phrase, 300);
    if (!brut || !phrase) continue;
    const mots = motsDe(phrase);
    if (!mots.length || mots.filter(m => dans.has(m)).length < mots.length * 0.85) continue;   // la phrase ne vient pas de la note
    const cle = sansAccent(brut).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const c = PAR_CLE.has(cle) ? cle : brut.toLowerCase();
    const def = critere(c);
    const r: Releve = { c, phrase };
    if (typeof o.valeur === "number" && Number.isFinite(o.valeur) && nombreDit(o.valeur, contenu)
        && (!def.douleur || (o.valeur >= 0 && o.valeur <= 10))) {
      r.n = Math.round(o.valeur * 10) / 10;
      const u = def.u ?? court(o.unite, 6);
      if (u) r.u = u;
    }
    const mot = court(o.mot, 60); if (mot && r.n == null) r.mot = mot;
    if (o.sens === "mieux" || o.sens === "pareil" || o.sens === "moins") r.sens = o.sens;
    if (c === "exercices") {
      if (o.exercices !== "fait" && o.exercices !== "partie" && o.exercices !== "pas") continue;   // exercices : fait, en partie ou pas fait, sinon rien
      r.ex = o.exercices; delete r.n; delete r.u; delete r.mot;
      const d = court(o.detail, 120); if (d) r.detail = d;
    }
    if (r.n == null && !r.mot && !r.sens && !r.ex) continue;
    if (vus.has(c)) continue;   // un critère une fois par séance
    vus.add(c); out.push(r);
    if (out.length >= 15) break;
  }
  return out;
}

/* ---------- ce qui est montré ---------- */

/* les relevés d'une séance, seulement s'ils viennent de son texte actuel (texte modifié depuis : en attente du nouveau) */
export const relevesDe = (s: Seance): Releve[] => s.releves && memeSource(s.releves_source, s.contenu) ? s.releves : [];
export const aDesReleves = (s: Seance) => !!s.releves && memeSource(s.releves_source, s.contenu);

const vir = (n: number) => String(n).replace(".", ",");
export function valeurReleve(r: Releve): string {
  if (r.ex) return EXO_FR[r.ex];
  if (r.n != null) return vir(r.n) + (r.u === "/10" ? "/10" : r.u === "°" ? "°" : r.u ? " " + r.u : "");
  return r.mot ?? (r.sens ? SENS_FR[r.sens] : "");
}
/* le sens ajouté après la valeur, sauf s'il n'y a que lui */
export const sensReleve = (r: Releve) => r.sens && (r.n != null || r.mot || r.ex) ? SENS_FR[r.sens] : "";

/* exercices à la maison d'un dossier, de la plus ancienne séance à la plus récente, et l'observance (fait 1, en partie ½) */
export type ExoVu = { seanceId: string; i: number; date: string; ex: Exo; detail?: string; phrase: string };
export function exercicesDe(dossierId: string, seances: Seance[]): ExoVu[] {
  return seances.filter(s => s.dossierId === dossierId).sort((a, b) => a.date.localeCompare(b.date) || a.cree.localeCompare(b.cree))
    .flatMap(s => relevesDe(s).flatMap((r, i) => r.ex ? [{ seanceId: s.id, i, date: s.date, ex: r.ex, ...(r.detail ? { detail: r.detail } : {}), phrase: r.phrase }] : []));
}
export function observance(l: ExoVu[]): number | null {
  if (!l.length) return null;
  return Math.round(l.reduce((t, e) => t + (e.ex === "fait" ? 1 : e.ex === "partie" ? 0.5 : 0), 0) / l.length * 100);
}

/* ---------- correction à la main ---------- */

/* « 5/10 », « 130° », « mieux », « fait », « en partie », « pas fait » : le relevé corrigé (même critère, même phrase) */
export function corriger(r: Releve, texte: string): Releve | null {
  const t = texte.trim();
  if (!t) return null;
  const base: Releve = { c: r.c, phrase: r.phrase, ok: true };
  if (r.c === "exercices") {
    const s = sansAccent(t);
    const ex: Exo | null = /pas|non|aucun/.test(s) ? "pas" : /partie|moitie|irregul|arret/.test(s) ? "partie" : /fait|oui/.test(s) ? "fait" : null;
    return ex ? { ...base, ex, ...(r.detail ? { detail: r.detail } : {}) } : null;
  }
  const m = t.match(/^(-?\d+(?:[.,]\d+)?)\s*(\/\s*10|°|mm|cm|kg|%)?$/);
  if (m) {
    const n = Number(m[1].replace(",", ".")), def = critere(r.c);
    if (def.douleur && (n < 0 || n > 10)) return null;
    const u = def.u ?? (m[2] ? m[2].replace(/\s/g, "") : r.u);
    return { ...base, n, ...(u ? { u } : {}), ...(r.sens ? { sens: r.sens } : {}) };
  }
  const s = sansAccent(t);
  if (/^(mieux|amelior)/.test(s)) return { ...base, sens: "mieux" };
  if (/^(pareil|inchange|stagne|idem)/.test(s)) return { ...base, sens: "pareil" };
  if (/^(moins bien|pire|aggrav|degrad)/.test(s)) return { ...base, sens: "moins" };
  return { ...base, mot: t.slice(0, 60) };
}
