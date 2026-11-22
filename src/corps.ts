/* Carte du corps (2.1.0, choix de Corentin du 20 au 22 novembre 2026) : règles pures, sans écran ni base.
   - Les zones d'un patient : douloureux, raideur, trajet nerveux, fracture (pas « à renforcer » : c'est du contenu de séance).
   - Une liste fixe de structures (muscles, articulations, nerfs), chacune dessinée sur une ou plusieurs planches.
   - Le choix de la vue : une seule région → la région agrandie ; plusieurs régions ou un trajet nerveux → le corps entier.
   - Vos gestes font foi (choix du 22 novembre) : une zone enlevée à la main n'est jamais redonnée par un bilan.
   Planches : Servier Medical Art (CC BY 4.0) pour le corps de face et de dos, Patrick J. Lynch (CC BY 2.5) pour la tête,
   Sobotta, atlas de 1909 (domaine public) pour l'épaule de profil. Coordonnées dans le repère de chaque planche. */

import type { Categorie, Cote } from "./regles";
export type { Categorie, Cote } from "./regles";
export const CATEGORIES: Record<Categorie, string> = { pain: "Douloureux", raide: "Raideur", nerf: "Trajet nerveux", frac: "Fracture" };

export type { Zone } from "./regles";
import type { Zone } from "./regles";

/* ---------- planches ---------- */
export type Planche = { fichier: string; l: number; h: number; image?: boolean; miroir?: boolean; nom: string };
export const PLANCHES: Record<string, Planche> = {
  face: { fichier: "corps-face.svg", l: 215, h: 561, nom: "Face" },
  dos: { fichier: "corps-dos.svg", l: 218, h: 559, nom: "Dos" },
  /* Lynch : le visage regarde vers la gauche, on voit donc le côté gauche ; retourné pour le côté droit */
  "tete-g": { fichier: "tete-profil.jpg", l: 1205, h: 1424, image: true, nom: "Profil gauche" },
  "tete-d": { fichier: "tete-profil.jpg", l: 1205, h: 1424, image: true, miroir: true, nom: "Profil droit" },
  "tete-face": { fichier: "tete-face.jpg", l: 1017, h: 1436, image: true, nom: "Face" },
  /* Sobotta : l'avant du bras est à gauche, on voit l'épaule gauche ; retournée pour la droite */
  "epaule-g": { fichier: "epaule-profil.jpg", l: 657, h: 800, image: true, nom: "Profil gauche" },
  "epaule-d": { fichier: "epaule-profil.jpg", l: 657, h: 800, image: true, miroir: true, nom: "Profil droit" },
};

/* Une forme sur une planche : ellipse (x, y, rx, ry) ou chemin (muscle fermé, trait de nerf ou de fracture).
   Côté droit sur les planches Servier : à gauche de l'écran de face, à droite de dos ; le côté gauche est le miroir. */
export type Forme = { x: number; y: number; rx: number; ry: number; d?: string; trait?: boolean };
type Dessin = Partial<Record<string, Forme>>;      // clé : planche (« face », « dos », « tete-d »…) côté droit ou centre

export type Structure = { nom: string; region: string; aussi?: string[]; dessins: Dessin; nerf?: boolean };   // aussi : autres régions où elle se voit
const e = (x: number, y: number, rx: number, ry = rx): Forme => ({ x, y, rx, ry });
const t = (d: string, x: number, y: number): Forme => ({ x, y, rx: 6, ry: 6, d, trait: true });
const m = (d: string, x: number, y: number, rx: number, ry: number): Forme => ({ x, y, rx, ry, d });

/* masséter et temporal sur la planche de profil de Lynch (côté gauche, vu tel quel) */
const LY_MASSETER = "M380 648 C400 644 420 642 440 642 C432 700 428 780 436 860 C444 920 458 960 472 992 C460 1000 448 1002 440 1000 C410 985 390 960 380 930 C366 880 364 790 368 730 C370 700 374 670 380 648 Z";
const LY_TEMPORAL = "M352 470 C352 410 390 330 450 292 C520 252 620 244 712 258 C800 274 870 320 904 400 C922 450 912 520 880 566 C840 600 780 606 720 604 C660 604 600 610 540 614 C480 616 420 606 382 578 C360 552 352 510 352 470 Z";
/* sur la planche de face de Lynch, côté droit du patient = gauche de l'écran */
const LF_MASSETER = "M365 738 C337 730 317 726 299 730 C291 800 295 880 305 964 C323 970 341 966 353 956 C363 880 369 800 365 738 Z";
const LF_TEMPORAL = "M175 400 C200 370 250 380 265 420 C275 470 268 530 255 560 C230 570 200 560 185 540 C172 500 168 440 175 400 Z";
/* épaule de profil de Sobotta (657 × 800, gauche vue telle quelle : l'avant à gauche) */
const SO = (d: string) => d.replace(/-?\d+(\.\d+)?/g, n => String(Math.round(Number(n) * 0.8)));
const SO_DANT = SO("M60 300 C80 250 130 215 200 215 L290 880 C240 880 200 860 170 820 C110 740 50 620 45 480 C45 400 50 340 60 300 Z");
const SO_DMOY = SO("M200 215 C260 205 330 205 380 212 L350 885 C330 892 305 892 290 880 Z");
const SO_DPOST = SO("M380 212 C440 215 500 225 540 245 C560 300 565 400 555 500 C530 640 460 780 350 885 Z");
const SO_TRAP = SO("M135 185 C200 140 300 95 470 95 C485 130 490 170 490 205 C400 200 250 200 135 210 Z");

export const STRUCTURES: Record<string, Structure> = {
  /* tête et visage */
  atm: { nom: "ATM", region: "tete", dessins: { face: e(81, 51, 3), "tete-g": e(626, 672, 22), "tete-face": e(205, 700, 16) } },
  masseter: { nom: "Masséter", region: "tete", dessins: { face: e(88, 67, 5, 8), "tete-g": m(LY_MASSETER, 412, 820, 40, 170), "tete-face": m(LF_MASSETER, 330, 850, 35, 115) } },
  temporal: { nom: "Temporal", region: "tete", dessins: { face: e(84, 32, 5.5, 8.5), "tete-g": m(LY_TEMPORAL, 630, 440, 270, 170), "tete-face": m(LF_TEMPORAL, 220, 470, 45, 90) } },
  zygoma: { nom: "Pommette (zygoma)", region: "tete", dessins: { face: e(90, 55, 5, 3), "tete-g": e(330, 650, 30, 20), "tete-face": e(282, 670, 50, 24) } },
  symphyse: { nom: "Menton (symphyse)", region: "tete", dessins: { face: e(107.5, 82, 3, 6), "tete-g": e(160, 1030, 20, 45), "tete-face": e(508, 1000, 14, 65) } },
  nez: { nom: "Nez", region: "tete", dessins: { face: e(107.5, 58, 3, 5), "tete-g": e(80, 700, 30, 40), "tete-face": e(508, 760, 40, 50) } },
  nerf_trijumeau: { nom: "Irradiation vers la tempe", region: "tete", nerf: true, dessins: {
    face: t("M81 51 C79 45 79 38 81 32 C82 27 85 22 89 19", 81, 40), "tete-g": t("M626 668 C640 620 646 560 650 500 C656 430 690 360 740 300", 660, 480),
    "tete-face": t("M205 700 C196 640 190 580 196 520 C200 470 210 430 226 400", 200, 560) } },
  /* cou et cervicales */
  cervicales: { nom: "Cervicales", region: "cou", dessins: { dos: e(109, 86, 7, 12) } },
  scm: { nom: "Sterno-cléido-mastoïdien", region: "cou", aussi: ["tete"], dessins: { face: e(95, 88, 4, 10) } },
  trapeze_sup: { nom: "Trapèze supérieur", region: "cou", aussi: ["epaule"], dessins: { dos: e(128, 98, 13, 6), "epaule-g": m(SO_TRAP, 250, 120, 140, 30) } },
  /* épaule */
  deltoide_ant: { nom: "Deltoïde, faisceau antérieur", region: "epaule", dessins: { face: e(52, 122, 6, 12), "epaule-g": m(SO_DANT, 110, 450, 60, 200) } },
  deltoide_moy: { nom: "Deltoïde, faisceau moyen", region: "epaule", dessins: { face: e(42, 128, 5, 12), dos: e(176, 122, 5, 11), "epaule-g": m(SO_DMOY, 245, 450, 55, 230) } },
  deltoide_post: { nom: "Deltoïde, faisceau postérieur", region: "epaule", dessins: { dos: e(165, 132, 7, 14), "epaule-g": m(SO_DPOST, 370, 380, 60, 200) } },
  sus_epineux: { nom: "Sus-épineux", region: "epaule", dessins: { dos: e(140, 112, 12, 4) } },
  sous_epineux: { nom: "Sous-épineux", region: "epaule", dessins: { dos: e(146, 138, 11, 9) } },
  petit_rond: { nom: "Petit rond", region: "epaule", dessins: { dos: e(158, 152, 6, 4) } },
  sous_scapulaire: { nom: "Sous-scapulaire", region: "epaule", dessins: { face: e(62, 140, 6, 6) } },
  coiffe: { nom: "Coiffe des rotateurs", region: "epaule", dessins: { dos: e(150, 128, 16, 14), face: e(50, 122, 8, 10) } },
  pectoral: { nom: "Grand pectoral", region: "epaule", dessins: { face: e(76, 130, 15, 12) } },
  biceps: { nom: "Biceps", region: "bras", aussi: ["epaule"], dessins: { face: e(46, 168, 7, 17) } },
  triceps: { nom: "Triceps", region: "bras", aussi: ["epaule"], dessins: { dos: e(172, 170, 7, 18) } },
  /* coude, avant-bras, main */
  epicondyle_lat: { nom: "Épicondyle latéral", region: "coude", dessins: { dos: e(178, 216, 5) } },
  epicondyle_med: { nom: "Épicondyle médial", region: "coude", dessins: { face: e(44, 190, 5) } },
  flechisseurs: { nom: "Fléchisseurs de l'avant-bras", region: "coude", dessins: { face: e(36, 232, 9, 25) } },
  extenseurs: { nom: "Extenseurs de l'avant-bras", region: "coude", dessins: { dos: e(181, 245, 8, 25) } },
  poignet: { nom: "Poignet", region: "main", dessins: { face: e(24, 292, 7, 5), dos: e(195, 292, 7, 5) } },
  main: { nom: "Main", region: "main", dessins: { face: e(20, 318, 9, 14), dos: e(199, 318, 9, 14) } },
  /* dos et bassin */
  dorsales: { nom: "Dorsales", region: "dos", dessins: { dos: e(109, 165, 9, 30) } },
  rhomboides: { nom: "Rhomboïdes", region: "dos", dessins: { dos: e(122, 135, 7, 12) } },
  grand_dorsal: { nom: "Grand dorsal", region: "dos", dessins: { dos: e(140, 195, 14, 28) } },
  lombaires: { nom: "Lombaires", region: "dos", dessins: { dos: e(109, 246, 15, 12) } },
  carre_lombes: { nom: "Carré des lombes", region: "dos", dessins: { dos: e(126, 240, 6, 10) } },
  sacro_iliaque: { nom: "Sacro-iliaque", region: "dos", dessins: { dos: e(119, 283, 5) } },
  /* hanche, cuisse, genou */
  moyen_fessier: { nom: "Moyen fessier", region: "hanche", dessins: { dos: e(145, 290, 10, 8) } },
  grand_fessier: { nom: "Grand fessier", region: "hanche", dessins: { dos: e(132, 318, 18, 18) } },
  pyramidal: { nom: "Pyramidal", region: "hanche", dessins: { dos: e(130, 302, 8, 4) } },
  hanche: { nom: "Hanche", region: "hanche", dessins: { face: e(72, 292, 8) } },
  adducteurs: { nom: "Adducteurs", region: "hanche", dessins: { face: e(95, 330, 7, 20) } },
  quadriceps: { nom: "Quadriceps", region: "genou", dessins: { face: e(77, 345, 15, 40) } },
  ischios: { nom: "Ischio-jambiers", region: "genou", dessins: { dos: e(128, 375, 13, 32) } },
  genou: { nom: "Genou", region: "genou", dessins: { face: e(83, 408, 9), dos: e(133, 412, 9) } },
  tendon_rotulien: { nom: "Tendon rotulien", region: "genou", dessins: { face: e(83, 425, 4, 8) } },
  /* jambe, cheville, pied */
  mollet: { nom: "Mollet", region: "cheville", dessins: { dos: e(130, 455, 14, 28) } },
  achille: { nom: "Tendon d'Achille", region: "cheville", dessins: { dos: e(128, 515, 4, 14) } },
  cheville: { nom: "Cheville", region: "cheville", dessins: { face: e(88, 522, 7), dos: e(128, 535, 7) } },
  pied: { nom: "Pied", region: "cheville", dessins: { face: e(85, 548, 10, 9) } },
  /* trajets nerveux (corps entier) */
  nerf_sciatique: { nom: "Nerf sciatique", region: "corps", nerf: true, dessins: { dos: t("M120 288 C126 310 128 335 128 360 C128 390 130 410 130 430 C130 460 128 490 126 525", 128, 400) } },
  nerf_ulnaire: { nom: "Nerf ulnaire (cubital)", region: "corps", nerf: true, dessins: { face: t("M95 95 C84 102 76 106 70 112 C62 126 58 140 56 152 C54 168 52 180 50 190 C46 210 42 230 38 250 C34 270 30 290 26 312", 50, 190) } },
  nerf_median: { nom: "Nerf médian", region: "corps", nerf: true, dessins: { face: t("M93 98 C80 106 72 110 67 116 C58 132 52 150 49 165 C47 178 45 186 43 192 C39 215 34 240 30 262 C27 280 24 296 20 316", 45, 190) } },
  nerf_crural: { nom: "Nerf crural (fémoral)", region: "corps", nerf: true, dessins: { face: t("M98 282 C92 300 88 316 86 332 C84 356 83 380 83 400 C83 420 84 440 85 470", 86, 360) } },
};

/* ---------- régions et vues ---------- */
/* Une région agrandie : ses vues possibles (planche + cadre) et celle par défaut. Le cadre contient toujours la
   région entière (jamais de tête coupée, choix de Corentin) ; l'écran le réduit pour qu'il tienne, quelle que soit sa forme. */
export type Vue = { planche: string; cadre: [number, number, number, number] };
const SERV = (pl: "face" | "dos", x: number, y: number, l: number, h: number, cote: Cote): Vue => {
  const centre = PLANCHES[pl].l / 2;
  /* le cadre est donné pour le côté droit ; le côté gauche est son miroir */
  const xd = cote === "g" ? (pl === "face" ? 2 * centre - x - l : 2 * centre - x - l) : x;
  return { planche: pl, cadre: [Math.round(xd), y, l, h] };
};

export function vuesRegion(region: string, cote: Cote): Vue[] {
  const c = cote === "c" ? "d" : cote;
  const tete = { "tete-d": { planche: "tete-d", cadre: [0, 30, 1205, 1370] as [number, number, number, number] }, "tete-g": { planche: "tete-g", cadre: [0, 30, 1205, 1370] as [number, number, number, number] }, face: { planche: "tete-face", cadre: [40, 40, 940, 1380] as [number, number, number, number] } };
  switch (region) {
    case "tete": return cote === "g" ? [tete.face, tete["tete-g"], tete["tete-d"]] : cote === "d" ? [tete.face, tete["tete-d"], tete["tete-g"]] : [tete.face, tete["tete-d"], tete["tete-g"]];
    case "cou": return [SERV("dos", 70, 50, 78, 75, "c"), SERV("face", 68, 50, 80, 75, "c")];
    case "epaule": return [SERV("face", 8, 82, 110, 140, c), { planche: c === "g" ? "epaule-g" : "epaule-d", cadre: [0, 48, 657, 720] }, SERV("dos", 100, 82, 110, 140, c)];
    case "bras": return [SERV("face", 10, 100, 90, 140, c), SERV("dos", 118, 100, 90, 140, c)];
    case "coude": return [SERV("face", 6, 160, 80, 120, c), SERV("dos", 132, 160, 80, 120, c)];
    case "main": return [SERV("face", 0, 260, 60, 90, c), SERV("dos", 158, 260, 60, 90, c)];
    case "dos": return [SERV("dos", 60, 60, 98, 260, "c")];
    case "hanche": return [SERV("dos", 90, 250, 110, 120, c), SERV("face", 40, 250, 110, 120, c)];
    case "genou": return [SERV("face", 40, 300, 90, 160, c), SERV("dos", 88, 300, 90, 160, c)];
    case "cheville": return [SERV("face", 50, 420, 80, 141, c), SERV("dos", 88, 420, 80, 139, c)];
    default: return [{ planche: "face", cadre: [0, 0, 215, 561] }, { planche: "dos", cadre: [0, 0, 218, 559] }];
  }
}
export const NOMS_REGIONS: Record<string, string> = { tete: "Tête", cou: "Cou", epaule: "Épaule", bras: "Bras", coude: "Coude et avant-bras", main: "Poignet et main", dos: "Dos", hanche: "Hanche", genou: "Genou", cheville: "Jambe et cheville", corps: "Corps entier" };
export const nomCote = (c: Cote) => c === "d" ? " droite" : c === "g" ? " gauche" : "";

/* la forme d'une structure sur une planche, pour un côté (le côté gauche : miroir sur les planches Servier ;
   les planches de tête et d'épaule ont leur version retournée) ; null si la structure n'y est pas dessinée */
export function formeSur(structure: string, planche: string, cote: Cote): Forme | null {
  const s = STRUCTURES[structure]; if (!s) return null;
  const P = PLANCHES[planche]; if (!P) return null;
  if (planche === "face" || planche === "dos") {
    const f = s.dessins[planche]; if (!f) return null;
    if (cote !== "g") return f;
    const c = P.l / 2;
    return { ...f, x: 2 * c - f.x, d: f.d ? miroirChemin(f.d, 2 * c) : undefined };
  }
  if (planche === "tete-face") {
    const f = s.dessins["tete-face"]; if (!f) return null;
    if (cote !== "g") return f;
    return { ...f, x: P.l - f.x, d: f.d ? miroirChemin(f.d, P.l) : undefined };
  }
  /* planches de profil : seulement le côté qu'elles montrent (centre : les deux) */
  const base = planche.startsWith("tete") ? "tete-g" : "epaule-g";
  const cotePl = planche.endsWith("-d") ? "d" : "g";
  if (cote !== "c" && cote !== cotePl) return null;
  const f = s.dessins[base] ?? null;
  if (!f) return null;
  return P.miroir ? { ...f, x: P.l - f.x, d: f.d ? miroirChemin(f.d, P.l) : undefined } : f;
}

/* retourne un chemin SVG (commandes absolues M, L, C, Q, Z) autour de x = largeur / 2 */
export function miroirChemin(d: string, largeur: number): string {
  let i = 0;
  return d.replace(/[MLCQZ]|-?\d+(?:\.\d+)?/gi, tok => {
    if (/[a-z]/i.test(tok)) { i = 0; return tok; }
    const v = Number(tok), sortie = i % 2 === 0 ? largeur - v : v;
    i++;
    return String(Math.round(sortie * 10) / 10);
  });
}

/* ---------- zones ---------- */
export const cleZone = (structure: string, cote: Cote, cat: Categorie) => `${structure}|${cote}|${cat}`;
export const zonesActives = (zs: Zone[] | undefined) => (zs ?? []).filter(z => !z.fin && !z.enlevee && STRUCTURES[z.structure]);
export const zonesAnciennes = (zs: Zone[] | undefined) => (zs ?? []).filter(z => (z.fin || z.enlevee) && STRUCTURES[z.structure]);

/* Ce que l'IA rend (bilan ou séance) : une zone nommée, à rattacher à une structure de la liste fixe.
   action : « ajout » (nouvelle ou toujours là), « mieux » (moins de douleur : pâlit), « fini » (plus de douleur : ancienne). */
export type ZoneDite = { structure: string; cote: Cote; cat: Categorie; nom: string; action?: "ajout" | "mieux" | "fini" };

/* zones d'un bilan : ajoutées, sauf celles que vous avez enlevées à la main (votre geste fait foi) ; rien n'est retiré */
export function zonesDuBilan(actuelles: Zone[] | undefined, dites: ZoneDite[], date: string, quand: string): Zone[] {
  const zs = [...(actuelles ?? [])];
  for (const z of dites) {
    if (!STRUCTURES[z.structure] || !CATEGORIES[z.cat]) continue;
    const id = cleZone(z.structure, z.cote, z.cat);
    if (zs.some(x => x.id === id)) continue;          // déjà là, ou enlevée à la main, ou ancienne : on n'y touche pas
    zs.push({ id, structure: z.structure, cote: z.cote, cat: z.cat, nom: z.nom || STRUCTURES[z.structure].nom + nomCote(z.cote), depuis: date, source: "bilan", maj: quand });
  }
  return zs;
}

/* zones dites dans une séance (la dernière du patient) : ajout, pâlit, devient ancienne ; jamais rien d'enlevé à la main
   n'est remis tout seul. Une zone n'est retirée du dessin que si la séance dit qu'elle va mieux (« plus de douleur »). */
export function zonesDeSeance(actuelles: Zone[] | undefined, dites: ZoneDite[], date: string, quand: string): Zone[] {
  const zs = (actuelles ?? []).map(z => ({ ...z }));
  for (const z of dites) {
    if (!STRUCTURES[z.structure] || !CATEGORIES[z.cat]) continue;
    const id = cleZone(z.structure, z.cote, z.cat);
    /* « mieux » ou « fini » sans catégorie précise : la douleur de cette structure (sinon sa raideur) */
    const cible = zs.find(x => x.id === id && !x.enlevee) ?? (z.action !== "ajout" ? zs.find(x => x.structure === z.structure && x.cote === z.cote && !x.enlevee && !x.fin) : undefined);
    if (z.action === "fini") { if (cible && !cible.fin) { cible.fin = date; cible.maj = quand; } continue; }
    if (z.action === "mieux") { if (cible && !cible.fin) { cible.mieux = date; cible.maj = quand; } continue; }
    if (cible?.enlevee) continue;
    if (cible) { if (cible.fin) { delete cible.fin; delete cible.mieux; cible.depuis = date; cible.maj = quand; } continue; }   // revenue
    zs.push({ id, structure: z.structure, cote: z.cote, cat: z.cat, nom: z.nom || STRUCTURES[z.structure].nom + nomCote(z.cote), depuis: date, source: "dictee", maj: quand });
  }
  return zs;
}

/* Choix de la vue (règles fixes) : un trajet nerveux ou plusieurs régions → le corps entier ; une seule région → elle,
   agrandie, dans la vue où ses structures sont dessinées. Le choix de Corentin, retenu par patient, l'emporte. */
export function regionsDe(zs: Zone[]): { region: string; cote: Cote }[] {
  const connues = zs.filter(z => STRUCTURES[z.structure]);
  /* une région qui montre toutes les zones (le trapèze supérieur se voit sur le cou comme sur l'épaule) */
  const de = (z: Zone) => [STRUCTURES[z.structure].region, ...(STRUCTURES[z.structure].aussi ?? [])];
  const communes = connues.length ? de(connues[0]).filter(r => connues.every(z => de(z).includes(r))) : [];
  const cote = (l: Zone[]): Cote => l.every(z => z.cote === l[0].cote) ? l[0].cote : "c";
  if (communes.length) return [{ region: communes[0], cote: cote(connues) }];
  const vues = new Map<string, Zone[]>();
  for (const z of connues) vues.set(STRUCTURES[z.structure].region, [...(vues.get(STRUCTURES[z.structure].region) ?? []), z]);
  return [...vues].map(([region, l]) => ({ region, cote: cote(l) }));
}

export function vueParDefaut(zs: Zone[]): { region: string; cote: Cote } {
  const actives = zonesActives(zs);
  const rs = regionsDe(actives);
  if (!rs.length || rs.length > 1 || rs.some(r => r.region === "corps")) return { region: "corps", cote: "c" };
  return rs[0];
}

/* la meilleure vue d'une région : celle qui montre le plus de zones actives */
export function meilleureVue(vues: Vue[], zs: Zone[]): number {
  let meilleure = 0, max = -1;
  vues.forEach((v, i) => { const n = zs.filter(z => formeSur(z.structure, v.planche, z.cote)).length; if (n > max) { max = n; meilleure = i; } });
  return meilleure;
}

/* liste fixe donnée à l'IA : « clé : nom (région) » */
export const listePourIA = () => Object.entries(STRUCTURES).map(([k, s]) => `${k} : ${s.nom}`).join(" ; ");
