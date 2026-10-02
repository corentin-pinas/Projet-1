/* Règles métier reprises à l'identique de la version d'essai (reference/bilans-seances-essai.html).
   Fonctions pures : aucune lecture de la base ni de l'écran, pour pouvoir les tester une à une. */

export type Rdv = { d: string; h: string };          // d : AAAA-MM-JJ, h : HH:MM ou ""

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
  corrections: { point: string; correction: string; quand: string }[];
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
  ia_ok?: boolean;
};

/* ---------- nom du patient tiré du nom du fichier ---------- */

/* « Fiche Bilan ÉPAULE - Sylvie F » -> « Sylvie F. » ; « … - Sylvie Fr » -> « Sylvie Fr. » */
export function patientFrom(name: string): string {
  name = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const part = name.includes(" - ") ? name.split(" - ").pop()! : name;
  const w = part.trim().split(/\s+/);
  if (w.length >= 2) {
    const up = w.filter(x => x === x.toUpperCase() && /[A-ZÀ-Ý]/.test(x));
    const nom = up[0] || w[w.length - 1], prenom = w.find(x => x !== nom) || w[0];
    const n = nom.replace(/\.$/, "");
    /* un nom entier (en majuscules, ou long) est réduit à son initiale ; une abréviation de 1 à 3 lettres est conservée */
    const abrege = n.length === 1 || (n.length <= 3 && n !== n.toUpperCase());
    const fin = abrege ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : n.charAt(0).toUpperCase();
    return prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase() + " " + fin + ".";
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

/* ---------- dates et rendez-vous ---------- */

export const isoDay = (d: Date) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

export const frDate = (iso: string) => { const [y, m, d] = String(iso).split("-"); return d ? `${d}/${m}/${y}` : iso; };

export const heureFr = (h: string) => h ? h.replace(/^0/, "").replace(":", " h ").replace(/ h 00$/, " h") : "";

export const rdvKey = (r: Rdv) => r.d + " " + (r.h || "99:99");

/* rendez-vous à venir (un par jour au plus), du plus proche au plus lointain ; les passés ne comptent plus */
export function rdvsAVenir(rdvs: Rdv[], aujourdhui: string): Rdv[] {
  const vus = new Map<string, Rdv>();
  for (const r of rdvs) if (r && r.d && r.d >= aujourdhui) vus.set(r.d, { d: r.d, h: r.h || "" });
  return [...vus.values()].sort((a, b) => rdvKey(a) < rdvKey(b) ? -1 : 1);
}

export const avecRdv = (list: Rdv[], d: string, h: string) =>
  list.filter(r => r.d !== d).concat([{ d, h: h || "" }]).sort((a, b) => rdvKey(a) < rdvKey(b) ? -1 : 1);

export function prochainRdv(rdvs: Rdv[], aujourdhui: string) {
  const l = rdvsAVenir(rdvs, aujourdhui);
  return l.length ? { k: rdvKey(l[0]), date: l[0].d, heure: l[0].h, autres: l.length - 1 } : null;
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
