/* Règles métier reprises à l'identique de la version d'essai (reference/bilans-seances-essai.html).
   Fonctions pures : aucune lecture de la base ni de l'écran, pour pouvoir les tester une à une. */

/* d : AAAA-MM-JJ ; p : demi-journée (« am » matin, « pm » après-midi), choix de Corentin depuis la 0.11 : plus d'heure précise ;
   h : HH:MM ou "" (anciens rendez-vous et heure dictée, sert seulement à ranger dans la demi-journée) ; t : « bilan », sinon séance */
export type Demi = "am" | "pm";
export type Rdv = { d: string; h: string; t?: "bilan"; p?: Demi };

export type Resume = {
  region?: string;
  date_bilan?: string;                                // JJ/MM/AAAA, tel qu'écrit sur le bilan
  age?: number | string | null;
  coup_oeil?: string;
  chiffres?: { label: string; valeur: string }[];
  sections?: { titre: string; items: string[] }[];
  a_verifier?: string[];
};

export type Dossier = {
  id: string;
  label: string;                                      // « Prénom I. »
  rdvs: Rdv[];
  homonyme: boolean;                                  // la question « même personne ? » reste à poser
  cree: string;
};

export type FichierBilan = { id: string; nom: string; type: string };

export type Bilan = {
  id: string;
  dossierId: string;
  fichier: string;                                    // nom du fichier d'origine, sans extension
  fichiers: FichierBilan[];
  ajoute: string;                                     // ISO
  resume: Resume | null;
  resume_erreur?: string;                             // dernier échec du résumé automatique
  valides: string[];
  corrections: { point: string; correction: string; quand: string; appliquee?: boolean }[];   // appliquee : reportée dans le résumé
  correction_erreur?: string;                         // dernier échec du report d'une correction dans le résumé
  origine?: string;                                   // appareil où le bilan a été déposé : lui seul le résume tout seul
};

export type Seance = {
  id: string;
  dossierId: string;
  date: string;                                       // AAAA-MM-JJ
  cree: string;                                       // ISO
  contenu: string;                                    // texte de référence
  propre?: string;                                    // texte mis au propre par l'IA
  propre_source?: string;                             // texte dont « propre » est issu
  brut?: string;                                      // dictée d'origine, gardée après une correction à la main
  avenir_resume?: string;
  avenir_source?: string;
  bref?: string;                                      // résumé court de la séance (écran « Ma journée »)
  bref_source?: string;                               // texte dont « bref » est issu
  ia_ok?: boolean;
};

/* ---------- nom du patient tiré du nom du fichier ---------- */

/* « Fiche Bilan ÉPAULE - Sylvie F » -> « Sylvie F. » ; « … - Sylvie Fr » -> « Sylvie Fr. »
   Prénom composé gardé en entier : « … - Marie-Laure D », « … - Marie Laure D » ou « … - Marie - Laure D » -> « Marie-Laure D. » */
const majuscule = (mot: string) => mot.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase());

export function patientFrom(name: string): string {
  name = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  /* le patient est après le titre du fichier (« Fiche Bilan Épaule - ») ; un « - » entouré d'espaces dans le prénom n'est pas un séparateur */
  const morceaux = name.split(/\s+-\s+/);
  const titre = morceaux.findIndex(m => /bilan|fiche/i.test(m));
  const part = morceaux.length < 2 ? name : titre >= 0 && titre < morceaux.length - 1 ? morceaux.slice(titre + 1).join("-") : morceaux[morceaux.length - 1];
  let w = part.trim().split(/\s+/);
  if (morceaux.length < 2) w = w.filter((x, i) => i >= w.length - 2 || !/bilan|fiche/i.test(x));   // « Bilan Marc Dupont » : le titre n'est pas le prénom
  if (w.length >= 2) {
    const up = w.filter(x => x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x));
    /* le nom : le mot en majuscules, sinon le dernier ; tous les mots avant lui forment le prénom */
    const iNom = up.length ? w.indexOf(up[up.length - 1]) : w.length - 1;
    /* une particule (« Le Goff », « de Lattre ») fait partie du nom */
    let debut = iNom;
    while (debut > 1 && /^(le|la|les|de|du|des|van|von|di|da|del|d'|l')$/i.test(w[debut - 1])) debut--;
    const nom = w[debut], avant = w.slice(0, debut);
    const prenom = (avant.length ? avant : w.filter((_, i) => i !== iNom).slice(0, 1)).join("-");
    const n = nom.replace(/\.$/, "");
    /* un nom entier (en majuscules, ou long) est réduit à son initiale ; une abréviation de 1 à 3 lettres est conservée */
    const abrege = debut === iNom && (n.length === 1 || (n.length <= 3 && n !== n.toUpperCase()));
    const fin = abrege ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : n.charAt(0).toUpperCase();
    return majuscule(prenom) + " " + fin + ".";
  }
  return part;
}

/* ---------- âge et homonymes ---------- */

export function ageOf(b: Bilan): number | null {
  const r = b.resume || {};
  let v: unknown = r.age;
  if (v == null && Array.isArray(r.chiffres)) {
    const c = r.chiffres.find(c => /^[âa]ge\b/i.test(String(c.label || "")));
    if (c) v = c.valeur;
  }
  const m = /\d{1,3}/.exec(String(v ?? ""));
  return m ? +m[0] : null;
}

/* date du bilan : celle écrite sur le bilan si on l'a, sinon la date d'ajout dans l'appli */
export function quandBilan(b: Bilan): Date {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(b.resume?.date_bilan || "").trim());
  return m ? new Date(+m[3], +m[2] - 1, +m[1], 12) : new Date(b.ajoute);
}

/* âges compatibles = même âge, à un an près par année écoulée entre les deux bilans ; un âge inconnu ne permet pas de trancher */
export function agesCompatibles(a: Bilan, b: Bilan): boolean {
  const x = ageOf(a), y = ageOf(b);
  if (x == null || y == null) return true;
  const ans = Math.abs(quandBilan(a).getTime() - quandBilan(b).getTime()) / 31557600000;
  return Math.abs(x - y) <= Math.floor(ans || 0) + 1;
}

/* âge d'un dossier : le premier âge connu parmi ses bilans, du plus récent au plus ancien */
export function ageDossier(bilansDuDossier: Bilan[]): number | null {
  for (const b of trierBilans(bilansDuDossier)) { const a = ageOf(b); if (a != null) return a; }
  return null;
}

export const trierBilans = (l: Bilan[]) => [...l].sort((a, b) => String(b.ajoute).localeCompare(String(a.ajoute)));

/* La question « même personne ? » pour un dossier en attente : renvoie l'autre dossier concerné, ou null.
   On attend que ses bilans soient résumés, car l'âge vient du résumé. */
export function questionHomonyme(d: Dossier, dossiers: Dossier[], bilans: Bilan[]): Dossier | null {
  if (!d.homonyme) return null;
  const siens = bilans.filter(b => b.dossierId === d.id);
  const ref = siens.find(b => b.resume);
  if (!ref) return null;
  for (const o of dossiers) {
    if (o.id === d.id || o.label !== d.label) continue;
    const autres = bilans.filter(b => b.dossierId === o.id);
    if (!autres.some(b => b.resume)) continue;
    const r = autres.find(b => ageOf(b) != null) || autres[0];
    if (agesCompatibles(ref, r)) return o;
  }
  return null;
}

/* deux dossiers au même prénom + initiale sont distingués par l'âge à l'affichage */
export function nomAffiche(d: Dossier, age: number | null, tous: Dossier[]): string {
  return d.label + (age != null && tous.some(o => o.id !== d.id && o.label === d.label) ? ", " + age + " ans" : "");
}

/* ---------- « À venir » : ce qui suit « pour la prochaine séance » dans le texte d'une séance ---------- */

export function avenirFrom(txt: string): string {
  const t = String(txt || "");
  const pats = [
    /(?:^|\n)[ \t]*[àa]\s+venir\s*:/i,
    /pour\s+la\s+(?:prochaine|s[ée]ance\s+suivante)(?:\s+(?:s[ée]ance|fois))?/i,
    /(?:la\s+)?prochaine\s+(?:s[ée]ance|fois)|s[ée]ance\s+suivante/i,
    /[.!?]\s*[àa]\s+venir\s*:/i
  ];
  for (const re of pats) {
    const m = re.exec(t);
    if (m) {
      const out = t.slice(m.index + m[0].length).replace(/^[\s:,;.\-–—]+/, "").trim();
      if (out) return out.charAt(0).toUpperCase() + out.slice(1);
    }
  }
  return "";
}

export const trierSeances = (l: Seance[]) =>
  [...l].sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.cree).localeCompare(String(x.cree)));

/* le « à venir » affiché est celui de la séance la plus récente */
export function avenirDe(seancesDuDossier: Seance[]) {
  const s = trierSeances(seancesDuDossier)[0];
  if (!s) return null;
  const brut = avenirFrom(s.contenu);
  if (!brut) return null;
  const ok = !!s.avenir_resume && s.avenir_source === brut;
  return { s, brut, texte: ok ? s.avenir_resume! : brut, resume: ok };
}

/* texte mis au propre par l'IA, valable tant que la note d'origine n'a pas changé */
export const propreOk = (s: Seance) => !!s.propre && s.propre_source === s.contenu;
export const texteDe = (s: Seance) => propreOk(s) ? s.propre! : s.contenu;

/* résumé court d'une séance : celui de l'IA tant que la note n'a pas changé,
   sinon « État du patient » et « Fait en séance » de la note, coupés à 160 caractères */
export function brefDe(s: Seance): string {
  if (s.bref && s.bref_source === s.contenu) return s.bref;
  const t = texteDe(s);
  const lignes = t.split("\n").map(l => /^(État du patient|Fait en séance) ?: ?(.*)$/.exec(l.trim())).filter(Boolean).map(m => m![2].trim());
  const out = (lignes.length ? lignes.join(" ; ") : t.replace(/\s+/g, " ")).trim();
  return out.length > 160 ? out.slice(0, 159).replace(/\s+\S*$/, "") + "…" : out;
}

/* ---------- dates et rendez-vous ---------- */

export const isoDay = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const frDate = (iso: string) => { const [y, m, d] = String(iso).split("-"); return d ? `${d}/${m}/${y}` : iso; };


/* demi-journée d'un rendez-vous : celle choisie, sinon d'après l'heure (avant 13 h : matin) ; null si rien n'est connu */
export const demiDe = (r: Rdv): Demi | null => r.p ?? (r.h ? (r.h < "13:00" ? "am" : "pm") : null);
export const DEMI_FR: Record<Demi, string> = { am: "matin", pm: "après-midi" };
export const demiFr = (r: Rdv) => { const m = demiDe(r); return m ? DEMI_FR[m] : ""; };

/* ordre : jour, puis matin, après-midi, sans précision ; dans la demi-journée, l'heure si elle est connue */
export const rdvKey = (r: Rdv) => { const m = demiDe(r); return r.d + " " + (m === "am" ? "1" : m === "pm" ? "2" : "3") + " " + (r.h || "99:99"); };
const copieRdv = (r: Rdv): Rdv => ({ d: r.d, h: r.h || "", ...(r.t === "bilan" ? { t: "bilan" as const } : {}), ...(demiDe(r) ? { p: demiDe(r)! } : {}) });

/* rendez-vous à venir (un par jour au plus), du plus proche au plus lointain ; les passés ne comptent plus */
export function rdvsAVenir(rdvs: Rdv[], aujourdhui: string): Rdv[] {
  const vus = new Map<string, Rdv>();
  for (const r of rdvs) if (r && r.d && r.d >= aujourdhui) vus.set(r.d, copieRdv(r));
  return [...vus.values()].sort((a, b) => rdvKey(a) < rdvKey(b) ? -1 : 1);
}

export const avecRdv = (list: Rdv[], d: string, h: string, t?: "bilan" | "seance", p?: Demi | null) =>
  list.filter(r => r.d !== d).concat([copieRdv({ d, h: h || "", ...(t === "bilan" ? { t: "bilan" as const } : {}), ...(p ? { p } : {}) })]).sort((a, b) => rdvKey(a) < rdvKey(b) ? -1 : 1);

export function prochainRdv(rdvs: Rdv[], aujourdhui: string) {
  const l = rdvsAVenir(rdvs, aujourdhui);
  return l.length ? { k: rdvKey(l[0]), date: l[0].d, heure: l[0].h, demi: demiDe(l[0]), bilan: l[0].t === "bilan", autres: l.length - 1 } : null;
}

export function jourLabel(iso: string, maintenant: Date): string {
  if (iso === isoDay(maintenant)) return "Aujourd'hui";
  const demain = new Date(maintenant); demain.setDate(demain.getDate() + 1);
  if (iso === isoDay(demain)) return "Demain";
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- liste des patients ---------- */

export type Ligne = { dossier: Dossier; bilans: Bilan[]; age: number | null; rdv: ReturnType<typeof prochainRdv> };

/* classement : par prochain rendez-vous (jour puis heure), puis « sans rendez-vous » ; à égalité, ordre alphabétique puis âge */
export function lignesListe(dossiers: Dossier[], bilans: Bilan[], recherche: string, aujourdhui: string): Ligne[] {
  const q = recherche.trim().toLowerCase();
  return dossiers
    .map(d => {
      const b = trierBilans(bilans.filter(x => x.dossierId === d.id));
      return { dossier: d, bilans: b, age: ageDossier(b), rdv: prochainRdv(d.rdvs, aujourdhui) };
    })
    .filter(l => !q || (l.dossier.label + " " + l.bilans.map(b => b.fichier).join(" ")).toLowerCase().includes(q))
    .sort((x, y) => {
      const a = x.rdv ? x.rdv.k : "~", c = y.rdv ? y.rdv.k : "~";
      return (a < c ? -1 : a > c ? 1 : 0) || x.dossier.label.localeCompare(y.dossier.label, "fr") || (x.age || 0) - (y.age || 0);
    });
}

/* ---------- dictée groupée : à quel dossier rattacher un patient nommé dans la dictée ---------- */

const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const mots = (t: string) => sansAccents(t).replace(/[^a-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);

/* Le nom dicté désigne-t-il ce dossier ? Même prénom (composé compris : « Marie Laure » ou « Marie-Laure ») ;
   l'initiale dictée, si elle est dite, doit concorder (« Marc Dupont » ou « Marc D. » pour « Marc D. », « Sylvie F. » pour « Sylvie Fr. »).
   Un prénom seul convient. */
export function nomCorrespond(dicte: string, label: string): boolean {
  const d = mots(dicte), l = mots(label);
  if (!d.length || !l.length) return false;
  if (d.join("") === l.join("")) return true;
  const espace = label.trim().indexOf(" ");
  if (espace < 0) {   // libellé collé (« ClaudineT ») : prénom dicté seul, à 3 lettres près
    const c = l.join(""), p = d.join("");
    return d.length === 1 && c.startsWith(p) && c.length - p.length <= 3;
  }
  const prenom = mots(label.slice(0, espace)), reste = mots(label.slice(espace)).join("");
  if (d.length < prenom.length || prenom.some((m, i) => d[i] !== m)) return false;
  const dit = d.slice(prenom.length).join("");
  return !dit || dit.startsWith(reste) || reste.startsWith(dit);
}

export type Rattachement = { dossier: Dossier | null; candidats: Dossier[] };

/* Règle choisie par Corentin : rangement automatique quand un seul dossier convient, en priorité parmi les patients
   qui ont rendez-vous ce jour-là (deux « Marc » dans l'appli, un seul vu ce jour-là : c'est lui).
   Sinon, doute : candidats = les dossiers possibles (tous les dossiers, rendez-vous du jour en tête, si aucun ne convient). */
export function rattacher(dicte: string | null, dossiers: Dossier[], date: string): Rattachement {
  const vuCeJour = (d: Dossier) => d.rdvs.some(r => r.d === date);
  const heure = (d: Dossier) => d.rdvs.find(r => r.d === date)?.h || "99:99";
  /* ordre affiché : rendez-vous du jour par heure, puis ordre alphabétique */
  const ordre = (a: Dossier, b: Dossier) => heure(a).localeCompare(heure(b)) || a.label.localeCompare(b.label, "fr");
  const possibles = dicte ? dossiers.filter(d => nomCorrespond(dicte, d.label)).sort(ordre) : [];
  const duJour = possibles.filter(vuCeJour);
  if (duJour.length === 1) return { dossier: duJour[0], candidats: duJour };
  if (!duJour.length && possibles.length === 1) return { dossier: possibles[0], candidats: possibles };
  const candidats = duJour.length > 1 ? duJour : possibles.length ? possibles
    : [...dossiers].sort(ordre);
  return { dossier: null, candidats };
}

/* ---------- agenda ---------- */

/* Durées choisies par Corentin : séance 20 minutes, bilan 40 minutes. */
export const PAS = 20;
export const dureeRdv = (r: Rdv) => r.t === "bilan" ? 40 : PAS;

export const minutes = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + (b || 0); };
export const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

/* Horaires habituels : pour chaque jour (1 = lundi … 6 = samedi), les plages de travail, pause de midi exclue. */
export type Plage = [string, string];
export type Horaires = Record<string, Plage[]>;
export const HORAIRES_DEFAUT: Horaires = {
  "1": [["08:00", "12:00"], ["14:00", "19:00"]], "2": [["08:00", "12:00"], ["14:00", "19:00"]],
  "3": [["08:00", "12:00"], ["14:00", "19:00"]], "4": [["08:00", "12:00"], ["14:00", "19:00"]],
  "5": [["08:00", "12:00"], ["14:00", "19:00"]], "6": []
};

const dateDe = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const numeroJour = (iso: string) => dateDe(iso).getDay() || 7;   // 1 = lundi … 7 = dimanche

/* les six jours (lundi à samedi) de la semaine qui contient ce jour */
export function semaine(iso: string): string[] {
  const d = dateDe(iso);
  d.setDate(d.getDate() - (numeroJour(iso) - 1));
  return Array.from({ length: 6 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return isoDay(x); });
}
export const decalerJours = (iso: string, n: number) => { const d = dateDe(iso); d.setDate(d.getDate() + n); return isoDay(d); };

export type RdvDuJour = { dossier: Dossier; rdv: Rdv; debut: number | null; fin: number | null };

export function rdvsDuJour(dossiers: Dossier[], iso: string): RdvDuJour[] {
  return dossiers.flatMap(d => d.rdvs.filter(r => r.d === iso).map(r => {
    const debut = r.h ? minutes(r.h) : null;
    return { dossier: d, rdv: r, debut, fin: debut == null ? null : debut + dureeRdv(r) };
  })).sort((a, b) => rdvKey(a.rdv).localeCompare(rdvKey(b.rdv)) || a.dossier.label.localeCompare(b.dossier.label, "fr"));
}

/* Plage de travail d'une demi-journée (d'après les horaires : celle qui commence avant 13 h est le matin) et nombre de places :
   une séance prend 20 minutes, un bilan 40. */
export function plageDemi(plages: Plage[], m: Demi): Plage | null {
  return plages.find(([a]) => (a < "13:00") === (m === "am")) ?? null;
}
export const placesPlage = (p: Plage | null) => p ? Math.floor((minutes(p[1]) - minutes(p[0])) / PAS) : 0;
export const placesPrises = (rdvs: Rdv[]) => rdvs.reduce((n, r) => n + dureeRdv(r) / PAS, 0);

/* ---------- « Ma journée » : les patients d'un jour, avec ce qui est prévu pour eux ---------- */

export type Carte = {
  dossier: Dossier; rdv: Rdv; bilan: Bilan | null;
  avenir: ReturnType<typeof avenirDe>;               // « À venir » de la dernière séance avant ce jour
  avant: Seance | null;                              // dernière séance avant ce jour
  faite: Seance | null;                              // séance déjà notée ce jour-là
};

export function journee(dossiers: Dossier[], bilans: Bilan[], seances: Seance[], iso: string): Carte[] {
  return rdvsDuJour(dossiers, iso).map(({ dossier, rdv }) => {
    const siennes = trierSeances(seances.filter(s => s.dossierId === dossier.id));
    const avant = siennes.filter(s => s.date < iso);
    return {
      dossier, rdv,
      bilan: trierBilans(bilans.filter(b => b.dossierId === dossier.id))[0] ?? null,
      avenir: avenirDe(avant),
      avant: avant[0] ?? null,
      faite: siennes.find(s => s.date === iso) ?? null
    };
  });
}

/* premier jour, à partir de celui-ci et dans les 14 jours, où un rendez-vous est noté ; null s'il n'y en a pas */
export function prochaineJournee(dossiers: Dossier[], iso: string): string | null {
  const jours = dossiers.flatMap(d => d.rdvs.map(r => r.d)).filter(d => d >= iso && d <= decalerJours(iso, 14)).sort();
  return jours[0] ?? null;
}

/* ---------- transmissions pour un remplaçant ---------- */

export type Transmission = {
  dossier: Dossier; age: number | null; bilan: Bilan | null;
  rdvs: Rdv[];                                       // rendez-vous de la période, dans l'ordre
  seances: Seance[];                                 // toutes ses séances, de la plus récente à la plus ancienne
  avenir: ReturnType<typeof avenirDe>;               // ce qui est prévu pour la suite (dernière séance)
};

/* Les patients qui ont au moins un rendez-vous entre du et au (inclus), dans l'ordre de leur premier rendez-vous. */
export function transmissions(dossiers: Dossier[], bilans: Bilan[], seances: Seance[], du: string, au: string): Transmission[] {
  return dossiers
    .map(d => {
      const b = trierBilans(bilans.filter(x => x.dossierId === d.id)), s = trierSeances(seances.filter(x => x.dossierId === d.id));
      const rdvs = d.rdvs.filter(r => r.d >= du && r.d <= au).sort((x, y) => rdvKey(x) < rdvKey(y) ? -1 : 1);
      return { dossier: d, age: ageDossier(b), bilan: b[0] ?? null, rdvs, seances: s, avenir: avenirDe(s) };
    })
    .filter(t => t.rdvs.length)
    .sort((x, y) => rdvKey(x.rdvs[0]) < rdvKey(y.rdvs[0]) ? -1 : rdvKey(x.rdvs[0]) > rdvKey(y.rdvs[0]) ? 1 : x.dossier.label.localeCompare(y.dossier.label, "fr"));
}

/* jours travaillés (d'après les horaires) de la période où aucun rendez-vous n'est noté : un oubli possible */
export function joursSansRdv(dossiers: Dossier[], horaires: Horaires, du: string, au: string): string[] {
  const pris = new Set(dossiers.flatMap(d => d.rdvs.map(r => r.d)));
  const out: string[] = [];
  for (let j = du; j <= au; j = decalerJours(j, 1)) if ((horaires[String(numeroJour(j))] ?? []).length && !pris.has(j)) out.push(j);
  return out;
}

/* la période proposée par défaut : la semaine prochaine, du lundi au dimanche */
export function semaineProchaine(aujourdhui: string): [string, string] {
  const lundi = decalerJours(semaine(aujourdhui)[0], 7);
  return [lundi, decalerJours(lundi, 6)];
}
