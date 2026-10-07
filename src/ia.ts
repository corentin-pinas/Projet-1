/* Appels à l'IA Claude, directement depuis la tablette, avec la clé de Corentin.
   Deux usages : résumer un bilan (PDF ou photos) et analyser une séance dictée
   (mise au propre, résumé « À venir », date du prochain rendez-vous).
   Les règles de prompt et les garde-fous de la séance sont repris de la version d'essai. */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { avenirFrom, isoDay, type Resume } from "./regles";

export const MODELE = "claude-opus-5-5";
/* tarif du modèle, en dollars par million de jetons (entrée, sortie) */
export const PRIX = { entree: 4, sortie: 20 };

export class ErreurIA extends Error {}

export type Usage = { entree: number; sortie: number; coutIndicatif?: number };
export type Reponse<T> = { donnees: T; usage: Usage };

/* ---------- appel ---------- */

export type Appel = (req: {
  cle: string; system: string; contenu: BetaContentBlockParam[];
  schema: Record<string, unknown>; effort: "low" | "medium" | "high"; maxTokens: number;
}) => Promise<Reponse<unknown>>;

/* Appel réel. Remplaçable dans les tests. */
export const appelerClaude: Appel = async ({ cle, system, contenu, schema, effort, maxTokens }) => {
  const client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 180_000 });
  let r: BetaMessage;
  try {
    r = await client.beta.messages.create({
      model: MODELE,
      max_tokens: maxTokens,
      // si le modèle décline par prudence, l'API reprend la demande sur un autre modèle
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: contenu }],
      output_config: { effort, format: { type: "json_schema", schema } }
    });
  } catch (e) {
    throw new ErreurIA(messageErreur(e));
  }
  if (r.stop_reason === "refusal") throw new ErreurIA("L'IA a refusé de traiter ce document.");
  if (r.stop_reason === "max_tokens") throw new ErreurIA("La réponse de l'IA a été coupée. Réessayez.");
  const texte = r.content.find(b => b.type === "text");
  if (!texte || texte.type !== "text") throw new ErreurIA("L'IA n'a pas répondu.");
  let donnees: unknown;
  try { donnees = JSON.parse(texte.text); } catch { throw new ErreurIA("La réponse de l'IA est illisible. Réessayez."); }
  return { donnees, usage: { entree: entreeTotale(r.usage), sortie: r.usage.output_tokens } };
};

const entreeTotale = (u: BetaMessage["usage"]) =>
  u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

/* Appel par l'abonnement : la demande part vers le serveur de l'appli, qui la confie à Claude Code connecté à l'abonnement.
   « cle » est ici le code d'accès au serveur. Rien n'est facturé à l'usage : c'est le quota de l'abonnement. */
export const appelerAbonnement: Appel = async ({ cle, system, contenu, schema, effort }) => {
  let r: Response;
  try {
    r = await fetch("/api/ia/travail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cle },
      body: JSON.stringify({ system, contenu, schema, effort })
    });
  } catch { throw new ErreurIA("Le serveur de l'appli est injoignable. Vérifiez la connexion à internet."); }
  let corps: { donnees?: unknown; erreur?: string; coutIndicatif?: number | null } = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok || corps.erreur) throw new ErreurIA(corps.erreur || `Le serveur a répondu par une erreur (${r.status}).`);
  return { donnees: corps.donnees, usage: { entree: 0, sortie: 0, coutIndicatif: corps.coutIndicatif ?? undefined } };
};

export function messageErreur(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La clé de l'IA est refusée. Vérifiez-la dans les réglages.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La clé de l'IA n'a pas les droits nécessaires.";
  if (e instanceof Anthropic.RateLimitError) return "Trop de demandes pour l'instant. Réessayez dans quelques minutes.";
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit|balance|billing/i.test(e.message)) return "Le compte de l'IA n'a plus de crédit. Rechargez-le sur la console Anthropic.";
    if (/too large|too long|size|pages/i.test(e.message)) return "Ce bilan est trop volumineux pour l'IA.";
    return "L'IA n'a pas accepté la demande.";
  }
  if (e instanceof Anthropic.APIConnectionError) return "Pas de connexion à internet, ou l'IA est injoignable.";
  if (e instanceof Anthropic.InternalServerError) return "L'IA est momentanément indisponible. Réessayez plus tard.";
  if (e instanceof Anthropic.APIError) return `L'IA a répondu par une erreur (${e.status}).`;
  return "L'appel à l'IA a échoué.";
}

/* Vérifie qu'une clé fonctionne, sans rien consommer. */
export async function testerCle(cle: string): Promise<string | null> {
  try {
    await new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 1 }).models.retrieve(MODELE);
    return null;
  } catch (e) { return messageErreur(e); }
}

export const coutDollars = (u: Usage) => (u.entree * PRIX.entree + u.sortie * PRIX.sortie) / 1e6;

/* ---------- résumé d'un bilan ---------- */

const texteOuNul = { anyOf: [{ type: "string" }, { type: "null" }] };

export const SCHEMA_RESUME = {
  type: "object",
  additionalProperties: false,
  required: ["region", "date_bilan", "age", "coup_oeil", "chiffres", "sections", "a_verifier"],
  properties: {
    region: { type: "string" },
    date_bilan: texteOuNul,
    age: { anyOf: [{ type: "integer" }, { type: "null" }] },
    coup_oeil: { type: "string" },
    chiffres: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["label", "valeur"], properties: { label: { type: "string" }, valeur: { type: "string" } } }
    },
    sections: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["titre", "items"],
        properties: { titre: { type: "string" }, items: { type: "array", items: { type: "string" } } }
      }
    },
    a_verifier: { type: "array", items: { type: "string" } }
  }
};

export type Correction = { point: string; correction: string };

export function systemeBilan(corrections: Correction[]): string {
  const deja = corrections.slice(-30);
  return [
    "Tu aides un kinésithérapeute en cabinet, surtout orienté épaule, à relire ses fiches de bilan initial.",
    "Tu reçois un bilan en images de pages : une trame PDF tapée, remplie à la main au stylet sur tablette. Lis surtout l'écriture manuscrite et les marques (entourages, croix) ; le texte tapé de la trame t'est aussi donné à part.",
    "",
    "Produis un résumé « coup d'œil » en français, fidèle au bilan :",
    "- region : la région traitée et le côté (par exemple « Épaule D », « Coude G »).",
    "- date_bilan : la date écrite sur le bilan au format JJ/MM/AAAA, sinon null.",
    "- age : l'âge du patient en années (entier), calculé seulement s'il est écrit ou déductible sans ambiguïté, sinon null.",
    "- coup_oeil : deux ou trois phrases courtes : motif, ancienneté, ce qui limite, éléments marquants de l'examen.",
    "- chiffres : les mesures clés telles qu'écrites (EVA, amplitudes, force, scores), avec l'âge en premier s'il est connu. Libellés courts.",
    "- sections : le reste du bilan rangé par rubriques (Anamnèse, Examen, Tests, Objectifs… selon le bilan), en items courts.",
    "- a_verifier : chaque lecture incertaine (écriture difficile, abréviation inconnue, valeur ambiguë), formulée pour que le kiné réponde « c'est juste » ou corrige.",
    "",
    "Conventions de ses bilans manuscrits : MVT = mouvement ; « + » entouré = test positif ; « − » entouré = test négatif ; rond barré = non fait ;",
    "grande croix ou rond barré sur une partie (par exemple l'EVA) = non évalué car non pertinent.",
    "Devant une abréviation inconnue, propose une interprétation et signale-la dans a_verifier.",
    "",
    "Confidentialité, règles strictes :",
    "- Patient : prénom et première lettre du nom uniquement, jamais le nom complet.",
    "- Médecin : sa spécialité seulement (généraliste, chirurgien de l'épaule…), jamais son nom.",
    "- Métier peu détaillé (« travail de bureau »), sans employeur.",
    "- Activités du quotidien conservées car utiles au soin, sans nom de club ni de commune.",
    "- Pas de date de naissance, seulement l'âge.",
    "",
    "N'invente rien, n'interprète pas au-delà de ce qui est écrit, ne donne pas de conseil de traitement. Style télégraphique, vocabulaire du kiné.",
    ...(deja.length ? [
      "",
      "Corrections déjà faites par le kiné sur des résumés précédents (tiens-en compte pour lire ses bilans) :",
      ...deja.map(c => `- Lu « ${c.point} » ; correction : « ${c.correction} »`)
    ] : [])
  ].join("\n");
}

/* garde l'essentiel, même si la réponse s'écarte un peu du format attendu */
export function normaliserResume(x: unknown): Resume {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const liste = (v: unknown) => Array.isArray(v) ? v : [];
  const date = str(o.date_bilan);
  const age = typeof o.age === "number" && Number.isFinite(o.age) && o.age > 0 && o.age < 120 ? Math.round(o.age) : null;
  return {
    region: str(o.region),
    date_bilan: /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date) ? date : "",
    age,
    coup_oeil: str(o.coup_oeil),
    chiffres: liste(o.chiffres).map(c => ({ label: str((c as Record<string, unknown>)?.label), valeur: str((c as Record<string, unknown>)?.valeur) })).filter(c => c.label && c.valeur),
    sections: liste(o.sections).map(s => ({
      titre: str((s as Record<string, unknown>)?.titre),
      items: liste((s as Record<string, unknown>)?.items).map(str).filter(Boolean)
    })).filter(s => s.titre && s.items.length),
    a_verifier: liste(o.a_verifier).map(str).filter(Boolean)
  };
}

/* Une pièce du bilan : une page en image (données en base64), un PDF tel quel en dernier recours,
   ou le texte tapé de la trame (type "text/plain", données en clair). */
export type PieceBilan = { type: string; donnees: string };

export function contenuBilan(pieces: PieceBilan[]): BetaContentBlockParam[] {
  const textes = pieces.filter(p => p.type === "text/plain" && p.donnees.trim());
  const blocs: BetaContentBlockParam[] = pieces.filter(p => p.type !== "text/plain").map(p => p.type === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.donnees } }
    : { type: "image", source: { type: "base64", media_type: p.type as "image/jpeg", data: p.donnees } });
  if (textes.length) blocs.push({ type: "text", text: "Texte tapé de la trame, extrait du PDF (sans l'écriture au stylet, qui n'apparaît que sur les images) :\n" + textes.map(t => t.donnees).join("\n").slice(0, 20000) });
  blocs.push({ type: "text", text: blocs.length > 2 ? "Voici les pages du bilan, dans l'ordre. Résume-le." : "Voici le bilan. Résume-le." });
  return blocs;
}

export async function resumerBilan(cle: string, pieces: PieceBilan[], corrections: Correction[], appel: Appel): Promise<Reponse<Resume>> {
  const r = await appel({ cle, system: systemeBilan(corrections), contenu: contenuBilan(pieces), schema: SCHEMA_RESUME, effort: "high", maxTokens: 16000 });
  const resume = normaliserResume(r.donnees);
  if (!resume.coup_oeil && !resume.sections?.length) throw new ErreurIA("L'IA n'a rien pu lire dans ce bilan.");
  return { donnees: resume, usage: r.usage };
}

/* ---------- analyse d'une séance (reprise de la version d'essai) ---------- */

/* repère de dates donné à l'IA pour qu'elle n'ait aucun calcul à faire */
export function calendrier(depuis: string, avant: number, apres: number): string {
  const [y, m, d] = depuis.split("-").map(Number), out: string[] = [];
  for (let i = -avant; i <= apres; i++) {
    const x = new Date(y, m - 1, d + i, 12);
    out.push((i === 0 ? "J" : i > 0 ? "J+" + i : "J" + i) + " : " + x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " = " + isoDay(x));
  }
  return out.join("\n");
}

export const parleRdv = (t: string) => /rendez[- ]?vous|\brdv\b|prochain|revoi|suivante/i.test(t);

export const SCHEMA_SEANCE = {
  type: "object",
  additionalProperties: false,
  required: ["propre", "resume", "rdv_date", "rdv_heure"],
  properties: { propre: texteOuNul, resume: texteOuNul, rdv_date: texteOuNul, rdv_heure: texteOuNul }
};

export function promptSeance(date: string, contenu: string, sansPropre: boolean): string {
  const brut = avenirFrom(contenu);
  return "Tu aides un kinésithérapeute. Voici sa note, souvent dictée à voix haute, pour la séance du " + date + " (J) avec un patient. " +
    "Une dictée peut contenir des mots mal reconnus, peu de ponctuation, des hésitations et des répétitions.\n\n" +
    "Calendrier de repère, à utiliser pour toute date (ne calcule rien toi-même) :\n" + calendrier(date, 0, 70) + "\n\n" +
    "Réponds uniquement par un objet JSON à quatre champs :\n" +
    '- "propre" : ' + (sansPropre ? "null" :
      "la note remise au propre. Corrige l'orthographe, la ponctuation et les mots manifestement mal reconnus par la dictée (termes d'anatomie et de kinésithérapie compris), retire hésitations et répétitions. " +
      "Range chaque information sous la rubrique qui convient, dans cet ordre, une rubrique par ligne au format « Rubrique : texte », sans les rubriques vides : " +
      "« État du patient » (ce que le patient rapporte, douleur, évolution depuis la dernière fois), « Fait en séance », « À faire à la maison », « Autres notes » (ce qui ne va nulle part ailleurs), « À venir » (ce qui est prévu pour la suite, y compris le moment de la prochaine séance s'il est dit, avec ses mots à lui). " +
      "Règles strictes : n'ajoute aucune information, n'interprète pas, ne conclus pas, ne retire aucune information, garde les chiffres et le vocabulaire du kinésithérapeute, phrases courtes. Si un mot reste incompréhensible, garde-le tel quel suivi de « (?) ». " +
      "Si un nom de famille complet apparaît, réduis-le à son initiale suivie d'un point.") + "\n" +
    '- "resume" : ' + (brut ? "résumé très court (25 mots maximum, français correct, style télégraphique) de ce qui est prévu pour la prochaine séance, d'après le passage « Prévu » ci-dessous. N'ajoute rien, n'interprète pas, ne retire rien d'important. N'y mets ni la date ni l'heure du rendez-vous. null s'il n'y a rien d'autre que la date." : "null") + "\n" +
    '- "rdv_date" : si la note dit quand aura lieu la prochaine séance (par exemple « dans une semaine », « lundi prochain », « le 12 »), la date correspondante lue dans le calendrier, au format AAAA-MM-JJ, comptée à partir de J. null si ce n\'est pas dit ou si c\'est ambigu. Ne devine pas.\n' +
    '- "rdv_heure" : l\'heure annoncée de cette prochaine séance au format HH:MM, sinon null.\n' +
    'Exemple : {"propre":"État du patient : douleur en baisse, 3/10.\\nFait en séance : renforcement des extenseurs.\\nÀ venir : tester la force en rotation externe, dans une semaine à 8 h.","resume":"Tester la force en rotation externe.","rdv_date":"2026-01-15","rdv_heure":"08:00"}\n\n' +
    "Note complète :\n" + contenu.slice(0, 8000) + (brut ? "\n\nPrévu :\n" + brut.slice(0, 4000) : "");
}

const okDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
const okHeure = (v: unknown) => {
  const m = typeof v === "string" && /^(\d{1,2})[:hH](\d{2})$/.exec(v.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : "";
};

export type AnalyseSeance = { propre: string; resume: string; rdvDate: string; rdvHeure: string };

/* Lecture de la réponse avec les garde-fous de la version d'essai :
   une mise au propre beaucoup plus courte que la dictée a sans doute perdu des informations, on ne la retient pas. */
export function lireAnalyse(x: unknown, contenu: string, sansPropre: boolean): AnalyseSeance {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const resume = typeof o.resume === "string" ? o.resume.trim().replace(/^["«\s]+|["»\s]+$/g, "").replace(/^[àa] venir\s*:\s*/i, "").slice(0, 400) : "";
  const pr = !sansPropre && typeof o.propre === "string" ? o.propre.trim() : "";
  const rdvDate = okDate(o.rdv_date);
  return {
    propre: pr && pr.length >= contenu.length * 0.35 ? pr : "",
    resume: avenirFrom(contenu) ? resume : "",
    rdvDate,
    rdvHeure: rdvDate ? okHeure(o.rdv_heure) : ""
  };
}

export async function analyserSeance(cle: string, date: string, contenu: string, sansPropre: boolean, appel: Appel): Promise<Reponse<AnalyseSeance>> {
  const r = await appel({
    cle, system: "Tu remets au propre les notes de séance d'un kinésithérapeute, sans rien ajouter ni retirer.",
    contenu: [{ type: "text", text: promptSeance(date, contenu, sansPropre) }],
    schema: SCHEMA_SEANCE, effort: "medium", maxTokens: 8000
  });
  return { donnees: lireAnalyse(r.donnees, contenu, sansPropre), usage: r.usage };
}
