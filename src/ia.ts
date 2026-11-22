/* Appels à l'IA Claude, directement depuis la tablette, avec la clé de Corentin.
   Deux usages : résumer un bilan (PDF ou photos) et analyser une séance dictée
   (mise au propre, résumé « À venir », date du prochain rendez-vous).
   Les règles de prompt et les garde-fous de la séance sont repris de la version d'essai. */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { avenirFrom, isoDay, type Demi, type Releve, type Resume } from "./regles";
import { CONSIGNE_RELEVES, lireReleves, SCHEMA_RELEVES, texteExemples } from "./releves";
import { listePourIA, STRUCTURES, type ZoneDite } from "./corps";

/* Deux niveaux d'IA, choisis par Corentin : la plus puissante pour les bilans (lecture du manuscrit) et la dictée groupée,
   une plus légère pour les séances (mise au propre d'une dictée), qui consomme moins de quota.
   prix : dollars par million de jetons (entrée, sortie), pour la clé API. */
export type Niveau = "puissant" | "leger";
export const MODELES: Record<Niveau, { api: string; abonnement: "opus" | "sonnet"; prix: { entree: number; sortie: number } }> = {
  puissant: { api: "claude-opus-5-5", abonnement: "opus", prix: { entree: 4, sortie: 20 } },
  leger: { api: "claude-sonnet-5-5", abonnement: "sonnet", prix: { entree: 2, sortie: 10 } }
};
export const MODELE = MODELES.puissant.api;
export const PRIX = MODELES.puissant.prix;

/* nature d'une erreur, pour décider d'une relance (audit M8, choix de Corentin du 6 novembre 2026) :
   reseau = pas de connexion (nouvel essai au retour du réseau) ; passager = serveur, PC ou IA qui n'a pas répondu
   (nouvel essai dans 5 minutes) ; definitif = relancer ne changerait rien (quota atteint, code refusé, réglage manquant…) */
export type Nature = "reseau" | "passager" | "definitif";
export class ErreurIA extends Error {
  constructor(message: string, public nature: Nature = "definitif") { super(message); }
}
export const natureDe = (e: unknown): Nature => e instanceof ErreurIA ? e.nature : "passager";
const horsLigne = () => typeof navigator !== "undefined" && navigator.onLine === false;
/* temps laissé au serveur de l'appli : Railway coupe une demande au bout de 15 minutes */
export const DELAI_SERVEUR_MS = 15.5 * 60_000;

/* cout : dollars facturés sur la clé API ; coutIndicatif : équivalent annoncé par Claude Code sur l'abonnement (non facturé) */
export type Usage = { entree: number; sortie: number; cout?: number; coutIndicatif?: number };
export type Reponse<T> = { donnees: T; usage: Usage };

/* ---------- appel ---------- */

export type Appel = (req: {
  cle: string; system: string; contenu: BetaContentBlockParam[];
  schema: Record<string, unknown>; effort: "low" | "medium" | "high"; maxTokens: number; niveau: Niveau;
}) => Promise<Reponse<unknown>>;

/* Appel réel. Remplaçable dans les tests. */
export const appelerClaude: Appel = async ({ cle, system, contenu, schema, effort, maxTokens, niveau }) => {
  const modele = MODELES[niveau];
  const client = new Anthropic({ apiKey: cle, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 180_000 });
  let r: BetaMessage;
  try {
    r = await client.beta.messages.create({
      model: modele.api,
      max_tokens: maxTokens,
      // si le modèle décline par prudence, l'API reprend la demande sur un autre modèle
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: contenu }],
      output_config: { effort, format: { type: "json_schema", schema } }
    });
  } catch (e) {
    const nature: Nature = e instanceof Anthropic.APIConnectionError ? (horsLigne() ? "reseau" : "passager")
      : e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError ? "passager" : "definitif";
    throw new ErreurIA(messageErreur(e), nature);
  }
  if (r.stop_reason === "refusal") throw new ErreurIA("L'IA a refusé de traiter ce document.");
  if (r.stop_reason === "max_tokens") throw new ErreurIA("La réponse de l'IA a été coupée. Réessayez.", "passager");
  const texte = r.content.find(b => b.type === "text");
  if (!texte || texte.type !== "text") throw new ErreurIA("L'IA n'a pas répondu.", "passager");
  let donnees: unknown;
  try { donnees = JSON.parse(texte.text); } catch { throw new ErreurIA("La réponse de l'IA est illisible. Réessayez.", "passager"); }
  const usage = { entree: entreeTotale(r.usage), sortie: r.usage.output_tokens };
  return { donnees, usage: { ...usage, cout: (usage.entree * modele.prix.entree + usage.sortie * modele.prix.sortie) / 1e6 } };
};

const entreeTotale = (u: BetaMessage["usage"]) =>
  u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);

/* Appel par l'abonnement : la demande part vers le serveur de l'appli, qui la confie à Claude Code connecté à l'abonnement.
   « cle » est ici le code d'accès au serveur. Rien n'est facturé à l'usage : c'est le quota de l'abonnement. */
/* adresse : celle du serveur de l'appli ; vide dans l'appli (même adresse), complète sur le PC (1.9.0, travail en tâche de fond) */
export const appelAbonnementVers = (adresse = ""): Appel => async ({ cle, system, contenu, schema, effort, niveau }) => {
  let r: Response;
  try {
    r = await fetch(adresse.replace(/\/+$/, "") + "/api/ia/travail", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + cle },
      body: JSON.stringify({ system, contenu, schema, effort, modele: MODELES[niveau].abonnement }),
      signal: AbortSignal.timeout(DELAI_SERVEUR_MS)   // sans réponse, l'appli lâche ; le serveur arrête alors Claude (audit M8)
    });
  } catch (e) {
    if ((e as Error)?.name === "TimeoutError") throw new ErreurIA("Le serveur de l'appli n'a pas répondu à temps.", "passager");
    if (horsLigne()) throw new ErreurIA("Pas de connexion à internet.", "reseau");
    throw new ErreurIA("Le serveur de l'appli est injoignable.", "passager");
  }
  let corps: { donnees?: unknown; erreur?: string; nature?: Nature; coutIndicatif?: number | null } = {};
  try { corps = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok || corps.erreur) {
    const nature: Nature = corps.nature ?? (r.status === 401 || r.status === 503 ? "definitif" : "passager");
    throw new ErreurIA(corps.erreur || `Le serveur a répondu par une erreur (${r.status}).`, nature);
  }
  return { donnees: corps.donnees, usage: { entree: 0, sortie: 0, coutIndicatif: corps.coutIndicatif ?? undefined } };
};
export const appelerAbonnement: Appel = appelAbonnementVers();

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

/* ---------- carte du corps (2.1.0) : les zones touchées, rattachées à une liste fixe de structures ---------- */
const ZONE_PROPS = {
  structure: { type: "string", enum: Object.keys(STRUCTURES) },
  cote: { type: "string", enum: ["d", "g", "c"] },
  etat: { type: "string", enum: ["pain", "raide", "nerf", "frac"] },
  nom: { type: "string" }
};
const ZONES_BILAN = { type: "array", items: { type: "object", additionalProperties: false, required: ["structure", "cote", "etat", "nom"], properties: ZONE_PROPS } };
const ZONES_SEANCE = { type: "array", items: { type: "object", additionalProperties: false, required: ["structure", "cote", "etat", "nom", "action"], properties: { ...ZONE_PROPS, action: { type: "string", enum: ["ajout", "mieux", "fini"] } } } };
const REGLES_ZONES = "structure : la clé la plus précise de cette liste (" + listePourIA() + ") ; cote : « d » droite, « g » gauche, « c » au milieu (rachis, menton, nez) ; " +
  "etat : « pain » douloureux, « raide » raideur ou tension à assouplir, « nerf » trajet nerveux (irradiation, fourmillements le long d'un nerf), « frac » fracture ; " +
  "nom : la zone avec ses mots (« faisceau postérieur du deltoïde droit »). Jamais « à renforcer » : ce qui est à renforcer n'est pas une zone. Ne devine pas une zone qui n'est pas écrite ou dessinée.";
const CONSIGNE_ZONES_BILAN = "les zones touchées, d'après le texte, l'écriture au stylet et les marques sur le schéma du corps (page 1), une par item : " + REGLES_ZONES + " [] s'il n'y en a pas.";
const CONSIGNE_ZONES_SEANCE = "les zones dont la note parle, une par item, avec action : « ajout » pour une zone nouvelle ou toujours présente (« douleur dorsale depuis lundi »), « mieux » si elle va mieux sans avoir disparu (« moins de douleur dorsale »), « fini » si elle a disparu (« plus de douleur dorsale », « n'a plus mal au genou »). " + REGLES_ZONES + " [] si la note ne parle d'aucune zone.";

export function lireZones(v: unknown, avecAction: boolean): ZoneDite[] {
  return (Array.isArray(v) ? v : []).map(e => {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const structure = typeof o.structure === "string" ? o.structure : "", cote = o.cote === "g" || o.cote === "c" ? o.cote : "d";
    const cat = (["pain", "raide", "nerf", "frac"] as const).find(c => c === o.etat);
    const action = (["ajout", "mieux", "fini"] as const).find(a => a === o.action);
    return STRUCTURES[structure] && cat ? { structure, cote, cat, nom: typeof o.nom === "string" ? o.nom.trim().slice(0, 120) : "", ...(avecAction ? { action: action ?? "ajout" } : {}) } as ZoneDite : null;
  }).filter((z): z is ZoneDite => !!z).slice(0, 24);
}

export const SCHEMA_RESUME = {
  type: "object",
  additionalProperties: false,
  required: ["region", "date_bilan", "age", "coup_oeil", "chiffres", "sections", "objectifs", "zones", "a_verifier"],
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
    objectifs: { type: "array", items: { type: "string" } },
    zones: ZONES_BILAN,
    a_verifier: { type: "array", items: { type: "string" } }
  }
};

export type Correction = { point: string; correction: string };

/* corrections : ce que le kiné a corrigé ; confirmees : les lectures qu'il a validées (« C'est juste ») sur ses bilans précédents.
   Les deux servent d'exemples : l'IA lit mieux ses bilans et ne redemande plus ce qu'il a déjà tranché. */
export function systemeBilan(corrections: Correction[], confirmees: string[] = []): string {
  const deja = corrections.slice(-60), justes = [...new Set(confirmees)].slice(-60);
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
    "- objectifs : les objectifs du patient (objectifs SMART de la trame, ou objectifs écrits ailleurs dans le bilan), un par item, avec ses mots ; [] s'il n'y en a pas. Ne les invente pas.",
    "- zones : " + CONSIGNE_ZONES_BILAN,
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
    ...(deja.length || justes.length ? [
      "",
      "Ce que le kiné a déjà tranché sur ses bilans précédents. Sers-t'en pour lire celui-ci : son écriture, ses abréviations et ses façons de noter reviennent d'un bilan à l'autre.",
      "Ne remets PAS dans a_verifier une lecture du même genre que celles ci-dessous (même abréviation, même façon d'écrire, même type de marque) : applique directement ce qu'il a confirmé ou corrigé.",
      "Garde a_verifier pour ce qui reste vraiment incertain dans ce bilan-ci ; s'il n'y a rien, laisse-le vide."
    ] : []),
    ...(deja.length ? [
      "",
      "Corrections du kiné :",
      ...deja.map(c => `- Lu « ${c.point} » ; correction : « ${c.correction} »`)
    ] : []),
    ...(justes.length ? [
      "",
      "Lectures confirmées justes par le kiné :",
      ...justes.map(v => `- ${v}`)
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
    objectifs: liste(o.objectifs).map(str).filter(Boolean).slice(0, 12),
    zones: lireZones(o.zones, false).map(({ structure, cote, cat, nom }) => ({ structure, cote, cat, nom })),
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

export async function resumerBilan(cle: string, pieces: PieceBilan[], corrections: Correction[], appel: Appel, confirmees: string[] = []): Promise<Reponse<Resume>> {
  const r = await appel({ cle, system: systemeBilan(corrections, confirmees), contenu: contenuBilan(pieces), schema: SCHEMA_RESUME, effort: "high", maxTokens: 16000, niveau: "puissant" });
  const resume = normaliserResume(r.donnees);
  if (!resume.coup_oeil && !resume.sections?.length) throw new ErreurIA("L'IA n'a rien pu lire dans ce bilan.");
  return { donnees: resume, usage: r.usage };
}

/* ---------- report d'une correction dans le résumé ---------- */

const longueurResume = (r: Resume) => JSON.stringify({ ...r, a_verifier: [], objectifs: r.objectifs ?? [], zones: undefined }).length;   // zones à part (2.1.0)   // objectifs toujours comptés pareil (1.8.0)

export function promptCorrection(resume: Resume, corrections: Correction[]): string {
  return "Voici le résumé d'un bilan de kinésithérapie, au format JSON, puis des corrections faites par le kinésithérapeute sur des points de lecture incertains.\n" +
    "Reporte chaque correction dans le résumé, partout où l'information corrigée apparaît (date du bilan, âge, coup d'œil, chiffres, rubriques). " +
    "Ne change rien d'autre : garde mot pour mot tout ce qui n'est pas concerné, n'ajoute rien, ne retire rien, ne reformule pas. " +
    "Renvoie le résumé complet dans le même format, avec a_verifier inchangé.\n\n" +
    "Résumé :\n" + JSON.stringify(resume) + "\n\n" +
    "Corrections :\n" + corrections.map(c => `- Point à vérifier : « ${c.point} » ; réponse du kiné : « ${c.correction} »`).join("\n");
}

/* Garde-fou : un résumé corrigé bien plus court que l'original a perdu des informations, on ne le retient pas. */
export async function corrigerResume(cle: string, resume: Resume, corrections: Correction[], appel: Appel): Promise<Reponse<Resume>> {
  const r = await appel({
    cle, system: "Tu reportes les corrections d'un kinésithérapeute dans le résumé de son bilan, sans rien changer d'autre.",
    contenu: [{ type: "text", text: promptCorrection(resume, corrections) }],
    schema: SCHEMA_RESUME, effort: "low", maxTokens: 16000, niveau: "leger"
  });
  const corrige = { ...normaliserResume(r.donnees), a_verifier: resume.a_verifier ?? [] };
  if (!corrige.coup_oeil || longueurResume(corrige) < longueurResume(resume) * 0.7) throw new ErreurIA("La correction n'a pas pu être reportée proprement dans le résumé.");
  return { donnees: corrige, usage: r.usage };
}

/* ---------- retrouver un patient oublié dans une dictée gardée ---------- */

const SCHEMA_PASSAGE = {
  type: "object", additionalProperties: false, required: ["trouve", "extrait"],
  properties: { trouve: { type: "boolean" }, extrait: { type: ["string", "null"] } }
};
const motsDe = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? [];

/* Le passage rendu doit venir de la dictée : 85 % de ses mots au moins s'y trouvent, sinon il n'est pas proposé. */
export async function chercherDansDictee(cle: string, dictee: string, patient: string, appel: Appel): Promise<Reponse<string | null>> {
  const r = await appel({
    cle, system: "Tu retrouves, dans la dictée d'un kinésithérapeute, le passage qui concerne un patient donné. Tu recopies, tu n'inventes rien.",
    contenu: [{ type: "text", text:
      `Retrouve le passage de cette dictée groupée qui concerne le patient « ${patient} » (il a pu être nommé par son seul prénom, ou mal transcrit par la dictée vocale).\n` +
      "Recopie ce passage mot pour mot, en entier (de l'annonce du patient jusqu'au patient suivant), sans rien corriger ni ajouter. " +
      'Réponds {"trouve": true, "extrait": "…"} ; s\'il n\'est pas question de ce patient, {"trouve": false, "extrait": null}.\n\n' +
      "Dictée :\n<<<\n" + dictee.slice(0, 150_000) + "\n>>>" }],
    schema: SCHEMA_PASSAGE, effort: "low", maxTokens: 8000, niveau: "leger"
  });
  const o = (r.donnees ?? {}) as { trouve?: unknown; extrait?: unknown };
  const extrait = o.trouve === true && typeof o.extrait === "string" ? o.extrait.trim() : "";
  if (!extrait) return { donnees: null, usage: r.usage };
  const dans = new Set(motsDe(dictee)), mots = motsDe(extrait);
  if (!mots.length || mots.filter(m => dans.has(m)).length < mots.length * 0.85) throw new ErreurIA("Le passage proposé par l'IA ne vient pas de la dictée : rien n'est rangé.");
  return { donnees: extrait, usage: r.usage };
}

/* ---------- analyse d'une séance (reprise de la version d'essai) ---------- */

/* Longueurs maximales envoyées à l'IA (audit F6) : au-delà, rien n'est coupé en silence, Muninn le dit.
   60 000 caractères ≈ une heure de dictée groupée ; 20 000 ≈ une demi-heure de parole pour un seul patient. */
export const MAX_DICTEE = 60_000, MAX_SEANCE = 20_000;
const milliers = (n: number) => n.toLocaleString("fr-FR");
export function verifierLongueur(texte: string, max: number, quoi: "dictee" | "seance") {
  const n = texte.trim().length;
  if (n <= max) return;
  throw new ErreurIA(quoi === "dictee"
    ? `Cette dictée est trop longue pour être rangée d'un coup (${milliers(n)} caractères, ${milliers(max)} au plus, environ une heure de parole). Coupez-la en deux : rangez la première moitié, puis la seconde. Rien n'a été rangé, votre dictée est gardée.`
    : `Cette note est trop longue pour être mise au propre (${milliers(n)} caractères, ${milliers(max)} au plus). Elle est enregistrée telle quelle.`);
}

/* repère de dates donné à l'IA pour qu'elle n'ait aucun calcul à faire */
export function calendrier(depuis: string, avant: number, apres: number): string {
  const [y, m, d] = depuis.split("-").map(Number), out: string[] = [];
  for (let i = -avant; i <= apres; i++) {
    const x = new Date(y, m - 1, d + i, 12);
    out.push((i === 0 ? "J" : i > 0 ? "J+" + i : "J" + i) + " : " + x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + " = " + isoDay(x));
  }
  return out.join("\n");
}

/* règles de mise au propre, communes à la séance seule et à la dictée groupée */
const REGLES_PROPRE =
  "Corrige l'orthographe, la ponctuation et les mots manifestement mal reconnus par la dictée (termes d'anatomie et de kinésithérapie compris), retire hésitations et répétitions. " +
  "Range chaque information sous la rubrique qui convient, dans cet ordre, une rubrique par ligne au format « Rubrique : texte », sans les rubriques vides : " +
  "« État du patient » (ce que le patient rapporte, douleur, évolution depuis la dernière fois), « Fait en séance », « À faire à la maison », « Autres notes » (ce qui ne va nulle part ailleurs), « À venir » (ce qui est prévu pour la suite, y compris le moment de la prochaine séance s'il est dit, avec ses mots à lui). " +
  "Règles strictes : n'ajoute aucune information, n'interprète pas, ne conclus pas, ne retire aucune information, garde les chiffres et le vocabulaire du kinésithérapeute, phrases courtes. Si un mot reste incompréhensible, garde-le tel quel suivi de « (?) ». " +
  "Si un nom de famille complet apparaît, réduis-le à son initiale suivie d'un point.";

const CONSIGNE_BREF = "résumé très court (20 mots maximum, style télégraphique) de la séance : état du patient et ce qui a été fait, avec ses chiffres (douleur, amplitudes). Pas ce qui est prévu pour la suite. N'ajoute rien, n'interprète pas. null si la note est vide.";

export const parleRdv = (t: string) => /rendez[- ]?vous|\brdv\b|prochain|revoi|suivante/i.test(t);

/* plusieurs rendez-vous dictés, et rendez-vous dits annulés (choix de Corentin du 11 novembre 2026) */
const RDV_AUTRES = { type: "array", items: { type: "object", additionalProperties: false, required: ["date", "demi"], properties: { date: { type: "string" }, demi: { type: ["string", "null"] } } } };
const RDV_ANNULES = { type: "array", items: { type: "string" } };
/* objectifs du patient dits dans une dictée (1.8.0) : proposés à Corentin, jamais appliqués tout seuls */
const OBJECTIFS = { type: "array", items: { type: "string" } };
/* 2.1.0 (choix de Corentin) : un objectif se mesure ; « renforcer », « assouplir », « travailler » sont du contenu de séance */
const CONSIGNE_OBJECTIFS = "les objectifs du patient que la note énonce (« nouvel objectif : courir 20 minutes », « objectif : se coiffer sans douleur », « on vise la reprise du tennis en mars »), un par item, avec ses mots. Seulement des objectifs mesurables (un chiffre, une durée, une douleur notée, une activité précise à reprendre) ; jamais ce qui est à renforcer, assouplir ou travailler, ni ce qui est prévu pour la prochaine séance. [] s'il n'y en a pas.";
const CONSIGNE_AUTRES = "les AUTRES séances à venir annoncées en plus de rdv_date (« lundi, mardi et jeudi prochain » : rdv_date = la première, rdv_autres = les suivantes), chacune {\"date\": AAAA-MM-JJ lue dans le calendrier, \"demi\": « matin », « après-midi » ou null si ce n'est pas dit pour ce jour-là}. [] s'il n'y en a pas. Ne devine pas.";
const CONSIGNE_ANNULES = "les dates (AAAA-MM-JJ, lues dans le calendrier) des séances que la note dit annulées ou qui n'ont plus lieu (« finalement plus jeudi », « on annule mardi », « pas de séance lundi »). [] sinon. Ne devine pas.";

export const SCHEMA_SEANCE = {
  type: "object",
  additionalProperties: false,
  required: ["propre", "resume", "bref", "rdv_date", "rdv_heure", "rdv_demi", "rdv_autres", "rdv_annules", "objectifs", "zones", "releves", "fin_traitement"],
  properties: { propre: texteOuNul, resume: texteOuNul, bref: texteOuNul, rdv_date: texteOuNul, rdv_heure: texteOuNul, rdv_demi: texteOuNul, rdv_autres: RDV_AUTRES, rdv_annules: RDV_ANNULES, objectifs: OBJECTIFS, zones: ZONES_SEANCE, releves: SCHEMA_RELEVES, fin_traitement: { type: "boolean" } }
};

export function promptSeance(date: string, contenu: string, sansPropre: boolean, exemples: string[] = []): string {
  const brut = avenirFrom(contenu);
  return "Tu aides un kinésithérapeute. Voici sa note, souvent dictée à voix haute, pour la séance du " + date + " (J) avec un patient. " +
    "Une dictée peut contenir des mots mal reconnus, peu de ponctuation, des hésitations et des répétitions.\n\n" +
    "Calendrier de repère, à utiliser pour toute date (ne calcule rien toi-même) :\n" + calendrier(date, 0, 70) + "\n\n" +
    "Réponds uniquement par un objet JSON avec les champs suivants :\n" +
    '- "propre" : ' + (sansPropre ? "null" : "la note remise au propre. " + REGLES_PROPRE) + "\n" +
    '- "resume" : ' + (brut ? "résumé très court (25 mots maximum, français correct, style télégraphique) de ce qui est prévu pour la prochaine séance, d'après le passage « Prévu » ci-dessous. N'ajoute rien, n'interprète pas, ne retire rien d'important. N'y mets ni la date ni l'heure du rendez-vous. null s'il n'y a rien d'autre que la date." : "null") + "\n" +
    '- "bref" : ' + CONSIGNE_BREF + "\n" +
    '- "rdv_date" : si la note dit quand aura lieu la prochaine séance (par exemple « dans une semaine », « lundi prochain », « le 12 »), la date correspondante lue dans le calendrier, au format AAAA-MM-JJ, comptée à partir de J. ' + REGLE_JOUR + ' null si ce n\'est pas dit ou si c\'est ambigu. Ne devine pas.\n' +
    '- "rdv_heure" : l\'heure annoncée de cette prochaine séance au format HH:MM, sinon null.\n' +
    '- "rdv_demi" : ' + CONSIGNE_DEMI + "\n" +
    '- "rdv_autres" : ' + CONSIGNE_AUTRES + "\n" +
    '- "rdv_annules" : ' + CONSIGNE_ANNULES + "\n" +
    '- "objectifs" : ' + CONSIGNE_OBJECTIFS + "\n" +
    '- "zones" : ' + CONSIGNE_ZONES_SEANCE + "\n" +
    '- "releves" : ' + CONSIGNE_RELEVES + "\n" +
    '- "fin_traitement" : ' + CONSIGNE_FIN + "\n" +
    'Exemple : {"propre":"État du patient : douleur en baisse, 3/10.\\nFait en séance : renforcement des extenseurs.\\nÀ venir : tester la force en rotation externe, dans une semaine à 8 h.","resume":"Tester la force en rotation externe.","bref":"Douleur 3/10, en baisse. Renforcement des extenseurs.","rdv_date":"2026-01-15","rdv_heure":"08:00","rdv_demi":"matin","rdv_autres":[],"rdv_annules":[],"objectifs":[],"zones":[],"releves":[{"critere":"douleur","valeur":3,"unite":"/10","mot":null,"sens":"mieux","exercices":null,"detail":null,"phrase":"douleur en baisse, 3/10"}],"fin_traitement":false}\n\n' +
    "Note complète :\n" + contenu.slice(0, MAX_SEANCE) + (brut ? "\n\nPrévu :\n" + brut.slice(0, 4000) : "") + texteExemples(exemples);
}

/* « mardi prochain » (choix de Corentin, 5 novembre 2026) */
const REGLE_JOUR = "Un jour de la semaine (« mardi », « mardi prochain ») désigne le premier jour de ce nom APRÈS J (dit un lundi, « mardi prochain » est le lendemain) ; « mardi en huit » ou « mardi de la semaine prochaine » : le mardi de la semaine qui suit celle de J.";
/* fin de traitement dite dans la dictée (choix de Corentin du 8 novembre 2026) : le dossier sera archivé */
const CONSIGNE_FIN = "true seulement si la note dit clairement que le traitement s'arrête : « dernière séance », « fin de traitement », « fin de prise en charge », « fin des soins », « on arrête les séances ». false sinon, et aussi s'il est seulement question d'une pause, d'un arrêt à discuter ou d'un report.";
const CONSIGNE_DEMI = "« matin » ou « après-midi » si la note le dit pour cette prochaine séance (ou si l'heure annoncée le dit : avant 13 h, matin), sinon null.";
/* demi-journée lue dans la réponse, sinon déduite de l'heure */
const okDemi = (v: unknown, heure: string): Demi | "" => {
  const t = typeof v === "string" ? v.toLowerCase() : "";
  return /apr[eè]s/.test(t) ? "pm" : /matin/.test(t) ? "am" : heure ? (heure < "13:00" ? "am" : "pm") : "";
};
const okDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
const okHeure = (v: unknown) => {
  const m = typeof v === "string" && /^(\d{1,2})[:hH](\d{2})$/.exec(v.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : "";
};

export type AnalyseSeance = { propre: string; resume: string; bref: string; rdvDate: string; rdvHeure: string; rdvDemi: Demi | ""; fin?: boolean;
  autres?: { d: string; demi: Demi | "" }[]; annules?: string[]; objectifs?: string[]; zones?: ZoneDite[]; releves?: Releve[] };

/* Lecture de la réponse avec les garde-fous de la version d'essai :
   une mise au propre beaucoup plus courte que la dictée a sans doute perdu des informations, on ne la retient pas. */
export function lireAnalyse(x: unknown, contenu: string, sansPropre: boolean): AnalyseSeance {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const resume = typeof o.resume === "string" ? o.resume.trim().replace(/^["«\s]+|["»\s]+$/g, "").replace(/^[àa] venir\s*:\s*/i, "").slice(0, 400) : "";
  const pr = !sansPropre && typeof o.propre === "string" ? o.propre.trim() : "";
  const rdvDate = okDate(o.rdv_date);
  /* les autres rendez-vous dits (sans doublon ni la première date) ; les annulés qui ne sont pas aussi redonnés */
  const vus = new Set(rdvDate ? [rdvDate] : []);
  const autres = (Array.isArray(o.rdv_autres) ? o.rdv_autres : []).map(e => {
    const it = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    return { d: okDate(it.date), demi: okDemi(it.demi, "") };
  }).filter(x => x.d && !vus.has(x.d) && (vus.add(x.d), true)).slice(0, 10);
  const annules = [...new Set((Array.isArray(o.rdv_annules) ? o.rdv_annules : []).map(okDate))].filter(d => d && !vus.has(d)).slice(0, 10);
  return {
    propre: pr && pr.length >= contenu.length * 0.35 ? pr : "",
    resume: avenirFrom(contenu) ? resume : "",
    bref: typeof o.bref === "string" ? o.bref.trim().slice(0, 300) : "",
    rdvDate,
    rdvHeure: rdvDate ? okHeure(o.rdv_heure) : "",
    rdvDemi: rdvDate ? okDemi(o.rdv_demi, okHeure(o.rdv_heure)) : "",
    fin: o.fin_traitement === true && !rdvDate && !autres.length,   // un prochain rendez-vous dit en même temps : ce n'est pas la fin
    autres, annules,
    objectifs: (Array.isArray(o.objectifs) ? o.objectifs : []).filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 12),
    zones: lireZones(o.zones, true),
    releves: lireReleves(o.releves, contenu)
  };
}

export async function analyserSeance(cle: string, date: string, contenu: string, sansPropre: boolean, appel: Appel, exemples: string[] = []): Promise<Reponse<AnalyseSeance>> {
  verifierLongueur(contenu, MAX_SEANCE, "seance");
  const r = await appel({
    cle, system: "Tu remets au propre les notes de séance d'un kinésithérapeute, sans rien ajouter ni retirer.",
    contenu: [{ type: "text", text: promptSeance(date, contenu, sansPropre, exemples) }],
    schema: SCHEMA_SEANCE, effort: "medium", maxTokens: 16000, niveau: "leger"
  });
  return { donnees: lireAnalyse(r.donnees, contenu, sansPropre), usage: r.usage };
}

/* ---------- dictée groupée : plusieurs patients dictés d'un bloc ---------- */

const SEANCE_DICTEE = {
  type: "object", additionalProperties: false,
  required: ["nom", "extrait", "absent", "propre", "resume", "bref", "rdv_date", "rdv_heure", "rdv_demi", "rdv_autres", "rdv_annules", "objectifs", "zones", "releves", "fin_traitement"],
  properties: { nom: texteOuNul, extrait: { type: "string" }, absent: { type: "boolean" }, propre: texteOuNul, resume: texteOuNul, bref: texteOuNul, rdv_date: texteOuNul, rdv_heure: texteOuNul, rdv_demi: texteOuNul, rdv_autres: RDV_AUTRES, rdv_annules: RDV_ANNULES, objectifs: OBJECTIFS, zones: ZONES_SEANCE, releves: SCHEMA_RELEVES, fin_traitement: { type: "boolean" } }
};
export const SCHEMA_DICTEE = {
  type: "object", additionalProperties: false, required: ["seances"],
  properties: { seances: { type: "array", items: SEANCE_DICTEE } }
};

/* patients : libellés de l'appli (« Marc D. »), avec vuCeJour si un rendez-vous est noté à la date des séances */
export function promptDictee(date: string, texte: string, patients: { label: string; vuCeJour: boolean }[], exemples: string[] = []): string {
  return "Tu aides un kinésithérapeute. Voici une dictée groupée : il a dicté à la suite les séances de plusieurs patients, toutes du " + date + " (J). " +
    "Une dictée peut contenir des mots mal reconnus (les prénoms aussi : « marque » pour « Marc »), peu de ponctuation, des hésitations et des répétitions.\n\n" +
    "Patients enregistrés dans son appli (prénom et initiale) :\n" +
    (patients.length ? [...patients].sort((a, b) => Number(b.vuCeJour) - Number(a.vuCeJour)).slice(0, 400).map(p => "- " + p.label + (p.vuCeJour ? " (rendez-vous ce jour-là)" : "")).join("\n") : "(aucun)") + "\n\n" +
    "Calendrier de repère, à utiliser pour toute date (ne calcule rien toi-même) :\n" + calendrier(date, 0, 70) + "\n\n" +
    "Découpe la dictée en une entrée par patient, dans l'ordre de la dictée. Il annonce chaque patient par son prénom, parfois suivi d'une initiale (« Avec Marc D. », « ensuite Élisabeth G. », « pour Lucie »). " +
    "Si le même patient revient plus loin, réunis ses passages dans une seule entrée. Un passage qui ne concerne aucun patient nommé forme une entrée avec nom null. Aucun passage de la dictée ne doit être perdu.\n" +
    "Pour chaque entrée, les champs :\n" +
    '- "nom" : le patient tel qu\'il est annoncé. S\'il correspond manifestement à un patient de la liste, écris-le exactement comme dans la liste ; sinon le prénom, et l\'initiale si elle est dite. Jamais de nom de famille complet. null si aucun patient n\'est nommé.\n' +
    '- "extrait" : le texte dicté pour ce patient, mot pour mot, sans l\'annonce de son nom (« Avec Marc D., » disparaît). Ne corrige rien, mais réduis tout nom de famille complet à son initiale suivie d\'un point.\n' +
    '- "absent" : ' + CONSIGNE_ABSENT + "\n" +
    '- "propre" : cet extrait remis au propre. ' + REGLES_PROPRE + "\n" +
    '- "resume" : si l\'extrait contient ce qui est prévu pour la prochaine séance (après « pour la prochaine séance », « pour la prochaine », « la prochaine fois » ou « à venir : »), un résumé très court (25 mots maximum, style télégraphique) de ce qui est prévu, sans la date ni l\'heure du rendez-vous. N\'ajoute rien. Sinon null.\n' +
    '- "bref" : ' + CONSIGNE_BREF + "\n" +
    '- "rdv_date" : si l\'extrait dit quand aura lieu la prochaine séance de ce patient, la date lue dans le calendrier, au format AAAA-MM-JJ, comptée à partir de J. ' + REGLE_JOUR + ' null si ce n\'est pas dit ou si c\'est ambigu. Ne devine pas.\n' +
    '- "rdv_heure" : l\'heure annoncée de cette prochaine séance au format HH:MM, sinon null.\n' +
    '- "rdv_demi" : ' + CONSIGNE_DEMI + "\n" +
    '- "rdv_autres" : ' + CONSIGNE_AUTRES + "\n" +
    '- "rdv_annules" : ' + CONSIGNE_ANNULES + "\n" +
    '- "objectifs" : ' + CONSIGNE_OBJECTIFS + "\n" +
    '- "zones" : ' + CONSIGNE_ZONES_SEANCE + "\n" +
    '- "releves" : ' + CONSIGNE_RELEVES + "\n" +
    '- "fin_traitement" : ' + CONSIGNE_FIN + "\n" +
    'Exemple : {"seances":[{"nom":"Marc D.","extrait":"douleur 3 sur 10 on a fait du renforcement des rotateurs externes pour la prochaine séance tester la force dans une semaine à 8 heures","propre":"État du patient : douleur 3/10.\\nFait en séance : renforcement des rotateurs externes.\\nÀ venir : tester la force, dans une semaine à 8 h.","resume":"Tester la force.","bref":"Douleur 3/10. Renforcement des rotateurs externes.","rdv_date":"2026-01-15","rdv_heure":"08:00","rdv_demi":"matin","rdv_autres":[],"rdv_annules":[],"objectifs":[],"zones":[],"releves":[{"critere":"douleur","valeur":3,"unite":"/10","mot":null,"sens":null,"exercices":null,"detail":null,"phrase":"douleur 3 sur 10"}],"fin_traitement":false,"absent":false}]}\n\n' +
    "Dictée :\n" + texte.slice(0, MAX_DICTEE) + texteExemples(exemples);
}

export type SeanceDictee = AnalyseSeance & { nom: string | null; contenu: string; absent?: boolean };
/* absences dites dans la dictée (choix de Corentin du 20 novembre 2026) : notées, sans séance */
const CONSIGNE_ABSENT = "true seulement si le passage dit que le patient n'est pas venu à sa séance ce jour-là (« absent aujourd'hui », « pas venu », « lapin », « a oublié son rendez-vous ») et qu'aucune séance n'a eu lieu ; false sinon (un rendez-vous futur annulé n'est pas une absence).";

/* Garde-fous : chaque extrait passe par les mêmes contrôles qu'une séance seule (mise au propre trop courte rejetée…),
   et si l'ensemble des extraits est bien plus court que la dictée, une partie a été perdue : rien n'est retenu. */
export function lireDictee(x: unknown, texte: string): SeanceDictee[] {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const liste = Array.isArray(o.seances) ? o.seances : [];
  const seances = liste.map(e => {
    const it = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const contenu = typeof it.extrait === "string" ? it.extrait.trim() : "";
    const nom = typeof it.nom === "string" && it.nom.trim() ? it.nom.trim() : null;
    return { nom, contenu, ...lireAnalyse(it, contenu, false), ...(it.absent === true ? { absent: true } : {}) };
  }).filter(s => s.contenu);
  const total = seances.reduce((n, s) => n + s.contenu.length, 0);
  if (!seances.length || total < texte.trim().length * 0.6) throw new ErreurIA("L'IA a laissé de côté une partie de la dictée. Rien n'a été rangé.", "passager");
  return seances;
}

export async function decouperDictee(cle: string, date: string, texte: string, patients: { label: string; vuCeJour: boolean }[], appel: Appel, exemples: string[] = []): Promise<Reponse<SeanceDictee[]>> {
  verifierLongueur(texte, MAX_DICTEE, "dictee");
  const r = await appel({
    cle, system: "Tu ranges la dictée groupée d'un kinésithérapeute, patient par patient, sans rien ajouter ni retirer.",
    contenu: [{ type: "text", text: promptDictee(date, texte, patients, exemples) }],
    schema: SCHEMA_DICTEE, effort: "medium", maxTokens: 32000, niveau: "puissant"
  });
  return { donnees: lireDictee(r.donnees, texte), usage: r.usage };
}


/* ---------- rattrapage de la carte du corps (2.1.0, demandé par Corentin le 22 novembre 2026) ----------
   Une seule fois, pour les patients déjà suivis : l'IA légère lit le résumé du bilan et les séances du dernier mois
   (texte seulement : elle ne voit pas les marques du schéma) et rend les zones, avec leur date d'apparition et, si
   une séance dit qu'elles ont disparu, de disparition. */
const ZONES_RATTRAPAGE = { type: "object", additionalProperties: false, required: ["zones"], properties: { zones: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["structure", "cote", "etat", "nom", "depuis", "fin", "mieux"],
  properties: { ...ZONE_PROPS, depuis: { type: "string" }, fin: texteOuNul, mieux: texteOuNul } } } } };
export type ZoneRattrapee = ZoneDite & { depuis: string; fin: string | null; mieux: string | null };
export async function zonesDuDossier(cle: string, resume: string, seances: { date: string; texte: string }[], dateBilan: string, appel: Appel): Promise<Reponse<ZoneRattrapee[]>> {
  const texte = "Tu aides un kinésithérapeute à remplir la carte du corps d'un patient déjà suivi. Voici le résumé de son bilan (du " + dateBilan + ") puis ses séances récentes, de la plus ancienne à la plus récente.\n\n" +
    "Rends un objet JSON {\"zones\": [...]} : chaque zone touchée, une par item. " + REGLES_ZONES +
    " depuis : la date (AAAA-MM-JJ) où elle apparaît (le bilan : " + dateBilan + ", ou la séance qui en parle la première) ; mieux : la date de la séance qui dit qu'elle va mieux sans avoir disparu, sinon null ; fin : la date de la séance qui dit qu'elle a disparu (« plus de douleur dorsale »), sinon null. [] s'il n'y a aucune zone.\n\n" +
    "Résumé du bilan :\n" + resume.slice(0, 12000) + "\n\nSéances :\n" + (seances.length ? seances.map(x => x.date + " : " + x.texte.slice(0, 2000)).join("\n") : "(aucune)");
  const r = await appel({ cle, system: "Tu relèves les zones touchées d'un patient de kinésithérapie, sans rien inventer.", contenu: [{ type: "text", text: texte }], schema: ZONES_RATTRAPAGE, effort: "low", maxTokens: 6000, niveau: "leger" });
  const o = (r.donnees && typeof r.donnees === "object" ? r.donnees : {}) as Record<string, unknown>;
  const brut = Array.isArray(o.zones) ? o.zones : [];
  const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const zones = brut.flatMap(e => { const z = lireZones([e], false)[0]; if (!z) return []; const it = e as Record<string, unknown>; return [{ ...z, depuis: date(it.depuis) ?? dateBilan, fin: date(it.fin), mieux: date(it.mieux) }]; }).slice(0, 24);
  return { donnees: zones, usage: r.usage };
}

/* ---------- rattrapage du suivi (2.2.0, demandé par Corentin le 22 novembre 2026) ----------
   Une seule fois par séance : pour les séances du dernier mois notées avant le relevé, une demande légère par patient
   rend les relevés de chaque séance, avec les mêmes garde-fous qu'une séance analysée. */
const RELEVES_RATTRAPAGE = { type: "object", additionalProperties: false, required: ["seances"], properties: { seances: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["id", "releves"], properties: { id: { type: "string" }, releves: SCHEMA_RELEVES } } } } };
export async function relevesDesSeances(cle: string, seances: { id: string; date: string; texte: string }[], appel: Appel, exemples: string[] = []): Promise<Reponse<Record<string, Releve[]>>> {
  const texte = "Tu aides un kinésithérapeute à suivre l'évolution d'un patient. Voici ses notes de séance, de la plus ancienne à la plus récente, chacune avec son identifiant.\n\n" +
    "Rends un objet JSON {\"seances\": [{\"id\": …, \"releves\": [...]}]}, une entrée par séance. releves : " + CONSIGNE_RELEVES + texteExemples(exemples) + "\n\n" +
    seances.map(x => "Séance " + x.id + " (" + x.date + ") :\n" + x.texte.slice(0, 4000)).join("\n\n");
  const r = await appel({ cle, system: "Tu relèves ce que des notes de séance de kinésithérapie disent de l'évolution du patient, sans rien inventer.", contenu: [{ type: "text", text: texte }], schema: RELEVES_RATTRAPAGE, effort: "low", maxTokens: 12000, niveau: "leger" });
  const o = (r.donnees && typeof r.donnees === "object" ? r.donnees : {}) as Record<string, unknown>;
  const out: Record<string, Releve[]> = {};
  for (const e of Array.isArray(o.seances) ? o.seances : []) {
    const it = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const se = seances.find(x => x.id === it.id);
    if (se) out[se.id] = lireReleves(it.releves, se.texte);
  }
  return { donnees: out, usage: r.usage };
}
