/* Carte du corps (2.1.0) : l'écran. Le corps entier ou une région agrandie, sur les planches réalistes teintées par
   l'ambiance ; toucher une région l'agrandit, la flèche ou un glissé vers la droite ramène au corps entier ; toucher une
   zone ouvre une bulle « Enlever / Déplacer / Garder » et « Le dessin est faux ? Me le signaler ». Règles dans corps.ts. */
import * as db from "./db";
import * as moteur from "./moteur";
import {
  CATEGORIES, formeSur, meilleureVue, NOMS_REGIONS, nomCote, PLANCHES, regionsDe, STRUCTURES, vueParDefaut, vuesRegion,
  zonesActives, zonesAnciennes, type Forme, type Vue, type Zone
} from "./corps";
import type { Dossier } from "./regles";
import { esc, toast } from "./ui";

/* ---------- planches ---------- */
const cache = new Map<string, Promise<string>>();
const lum = (h: string) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16); return (0.3 * (n >> 16 & 255) + 0.59 * (n >> 8 & 255) + 0.11 * (n & 255)) / 255; };

/* une planche Servier, préparée une fois : chaque forme garde son centre, sa taille et sa clarté (pour colorer les muscles) */
function servier(cle: string): Promise<string> {
  if (!cache.has(cle)) cache.set(cle, (async () => {
    const txt = await (await fetch("/planches/" + PLANCHES[cle].fichier)).text();
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-10000px;top:0;width:300px;height:780px;visibility:hidden";
    box.innerHTML = txt.slice(txt.indexOf("<svg"));
    document.body.append(box);
    const svg = box.querySelector("svg")!;
    svg.setAttribute("width", "300"); svg.setAttribute("height", "780");
    const inv = svg.getScreenCTM()!.inverse();
    for (const p of svg.querySelectorAll<SVGPathElement>("path")) {
      if (p.closest("clipPath")) continue;
      const f = p.getAttribute("fill") || "";
      if (!f.startsWith("#")) continue;
      const L = lum(f), b = p.getBBox(), mt = inv.multiply(p.getScreenCTM()!);
      const c = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(mt);
      p.dataset.x = c.x.toFixed(1); p.dataset.y = c.y.toFixed(1); p.dataset.l = L.toFixed(2);
      p.dataset.w = Math.max(b.width * Math.abs(mt.a), b.height * Math.abs(mt.d)).toFixed(1);
      if (/dd9879|c68d72|eaaf92|f6dccf/i.test(f)) p.dataset.m = "1";
      if (L < .35) p.setAttribute("class", "pt"); else { p.setAttribute("class", "pf"); p.setAttribute("fill-opacity", (0.05 + (1 - L) * 0.55).toFixed(2)); }
      p.removeAttribute("fill");
    }
    svg.removeAttribute("width"); svg.removeAttribute("height");
    const sortie = svg.innerHTML; box.remove();
    return sortie;
  })());
  return cache.get(cle)!;
}

/* couleur CSS lue sur l'écran, en composantes 0..1 (pour teinter les planches en image) */
function couleur(v: string): [number, number, number] {
  const i = document.createElement("i"); i.style.color = `var(${v})`; document.body.append(i);
  const c = getComputedStyle(i).color; i.remove();
  const n = (c.match(/[\d.]+/g) ?? ["1", "1", "1"]).map(Number);
  return c.startsWith("color(") ? [n[0], n[1], n[2]] : [n[0] / 255, n[1] / 255, n[2] / 255];
}
const matrice = ([r, g, b]: number[], k: number, c0: number) => `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${-.3 * k} ${-.59 * k} ${-.11 * k} ${k} ${c0}`;
let nSvg = 0;

/* zigzag de fracture à travers une forme, dans son grand axe */
function zigzag(f: Forme): string {
  const long = Math.max(f.rx, f.ry), court = Math.min(f.rx, f.ry) * .8 || long * .3, n = 6, pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -long + (2 * long * i) / n, o = (i % 2 ? 1 : -1) * court;
    pts.push(f.rx >= f.ry ? `${(f.x + t).toFixed(1)} ${(f.y + o).toFixed(1)}` : `${(f.x + o).toFixed(1)} ${(f.y + t).toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

type Opt = { numeros?: Map<string, number>; cibles?: { region: string; cote: Zone["cote"]; f: Forme }[] };

/* une planche avec ses zones : SVG complet. zoom : numéros et zones touchables. */
async function planche(v: Vue, zones: Zone[], o: Opt = {}): Promise<string> {
  const P = PLANCHES[v.planche], s = "c" + (++nSvg), [cx, cy, cl, ch] = v.cadre, larg = cl;
  const formes = zones.map(z => ({ z, f: formeSur(z.structure, v.planche, z.cote) })).filter((x): x is { z: Zone; f: Forme } => !!x.f);
  const dec = (z: Zone) => z.decal?.[v.planche] ?? [0, 0];
  let fond: string, defs = `<filter id="fl${s}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${larg * .012}"/></filter>`
    + Object.keys(CATEGORIES).map(c => `<radialGradient id="g${c}${s}"><stop offset="0" stop-color="var(--${c})" stop-opacity=".9"/><stop offset=".5" stop-color="var(--${c})" stop-opacity=".4"/><stop offset="1" stop-color="var(--${c})" stop-opacity="0"/></radialGradient>`).join("");
  let dessus = "";
  if (P.image) {
    const src = "/planches/" + P.fichier, retour = P.miroir ? ` transform="translate(${P.l} 0) scale(-1 1)"` : "";
    defs += `<filter id="t${s}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrice(couleur("--plaque"), .95, 0)}"/></filter>`;
    for (const c of Object.keys(CATEGORIES)) defs += `<filter id="f${c}${s}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${matrice(couleur("--" + c), c === "raide" ? 1.8 : 1.5, c === "raide" ? .3 : .15)}"/></filter>`;
    fond = `<g${retour}><image href="${src}" width="${P.l}" height="${P.h}" filter="url(#t${s})"/></g>`;
    formes.forEach(({ z, f }, i) => {
      if (!f.d || f.trait || z.cat === "frac") return;
      defs += `<clipPath id="k${i}${s}"><path d="${f.d}"/></clipPath>`;
      dessus += `<g class="zp${z.mieux ? " pale" : ""}"><g clip-path="url(#k${i}${s})"><rect width="${P.l}" height="${P.h}" fill="#000" opacity=".55"/><g${retour}><image href="${src}" width="${P.l}" height="${P.h}" filter="url(#f${z.cat}${s})"/></g></g><path d="${f.d}" fill="none" stroke="var(--${z.cat})" stroke-width="${larg * .005}" class="zbord"/></g>`;
    });
  } else {
    const txt = await servier(v.planche);
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg"); tmp.innerHTML = txt;
    /* muscles colorés : les formes « muscle » dont le centre est dans la zone */
    const peintes = formes.filter(({ z, f }) => !f.trait && z.cat !== "frac" && z.cat !== "nerf");
    for (const p of tmp.querySelectorAll<SVGPathElement>("path[data-m]")) {
      const px = +p.dataset.x!, py = +p.dataset.y!, w = +p.dataset.w!;
      const t = peintes.find(({ f }) => w < Math.max(f.rx, f.ry) * 3.2 && ((px - f.x) / f.rx) ** 2 + ((py - f.y) / f.ry) ** 2 < 1);
      if (t) { p.setAttribute("style", `fill:var(--${t.z.cat})`); p.setAttribute("fill-opacity", String((+p.dataset.l! > .85 ? (t.z.cat === "raide" ? .75 : .55) : .95) * (t.z.mieux ? .4 : 1))); }
    }
    fond = tmp.innerHTML;
  }
  /* lueurs, trajets nerveux, fractures */
  let lueurs = "";
  for (const { z, f } of [...formes].sort((a, b) => Number(a.z.cat === "frac") - Number(b.z.cat === "frac"))) {
    const [dx, dy] = dec(z), op = z.mieux ? .38 : 1, tr = `transform="translate(${dx} ${dy})"`;
    if (z.cat === "frac") { const d = f.trait && f.d ? f.d : zigzag(f);
      lueurs += `<g ${tr} opacity="${op}" class="zfrac"><path d="${d}" stroke="var(--frac)" stroke-width="${larg * .03}" opacity=".35" filter="url(#fl${s})"/><path d="${d}" stroke="#140a10" stroke-width="${larg * .016}" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" stroke="var(--frac)" stroke-width="${larg * .007}" stroke-linejoin="round" stroke-linecap="round"/></g>`; }
    else if (f.trait && f.d) lueurs += `<g ${tr} opacity="${op}" class="znerf"><path d="${f.d}" stroke="var(--${z.cat})" stroke-width="${larg * .03}" opacity=".45" filter="url(#fl${s})"/><path d="${f.d}" stroke="var(--${z.cat})" stroke-width="${larg * .009}" stroke-linecap="round" stroke-dasharray="${larg * .022} ${larg * .01}"/></g>`;
    else if (!f.d || !P.image) { const k = larg > 150 && !P.image ? Math.max(1.6, (cl / 14) / Math.max(f.rx, f.ry)) : 1.6;
      lueurs += `<g ${tr} opacity="${op}"><ellipse cx="${f.x}" cy="${f.y}" rx="${f.rx * k}" ry="${f.ry * k}" fill="url(#g${z.cat}${s})"/>${!f.d && P.image ? `<circle cx="${f.x}" cy="${f.y}" r="${f.rx * .5}" fill="var(--${z.cat})" stroke="#fff" stroke-width="${larg * .003}"/>` : ""}</g>`; }
  }
  /* numéros et zones touchables */
  let cibles = "";
  if (o.numeros) {
    const r = larg * .028;
    for (const { z, f } of formes) {
      const n = o.numeros.get(z.id); if (n == null) continue;
      const [dx, dy] = dec(z), bx = f.x + (z.cat === "frac" ? Math.max(f.rx, f.ry) * .6 + r * 1.4 : 0), by = f.y;
      const touche = f.d ? `<path d="${f.d}" fill="${f.trait ? "none" : "transparent"}" stroke="transparent" stroke-width="${f.trait ? larg * .07 : 0}"/>` : `<ellipse cx="${f.x}" cy="${f.y}" rx="${Math.max(f.rx * 1.2, r * 1.6)}" ry="${Math.max(f.ry * 1.2, r * 1.6)}" fill="transparent"/>`;
      cibles += `<g data-z="${esc(z.id)}" data-pl="${v.planche}" transform="translate(${dx} ${dy})" opacity="${z.mieux ? .6 : 1}" class="zcible">${touche}<circle cx="${bx}" cy="${by}" r="${r}" fill="var(--${z.cat})" stroke="#fff" stroke-opacity=".85" stroke-width="${r * .14}"/><text x="${bx}" y="${by + r * .38}" text-anchor="middle" font-size="${r * 1.1}" font-weight="700" fill="#140a10">${n}</text></g>`;
    }
  }
  for (const c of o.cibles ?? []) cibles += `<ellipse data-zoom="${esc(c.region)}" data-cote="${c.cote}" cx="${c.f.x}" cy="${c.f.y}" rx="${c.f.rx}" ry="${c.f.ry}" fill="transparent" stroke="var(--accent2,var(--accent))" stroke-opacity=".8" stroke-width="${larg * .007}" stroke-dasharray="${larg * .02} ${larg * .014}"/>`;
  return `<svg class="pl" viewBox="${cx} ${cy} ${cl} ${ch}" preserveAspectRatio="xMidYMid meet" data-planche="${v.planche}"><defs>${defs}</defs><g class="fondpl">${fond}</g>${dessus}<g style="mix-blend-mode:screen" fill="none">${lueurs}</g>${cibles}</svg>`;
}

/* cadre englobant des zones d'une région sur le corps entier (cible pointillée à toucher pour agrandir) */
function cibleRegion(zs: Zone[], planche: string): Forme | null {
  const fs = zs.map(z => formeSur(z.structure, planche, z.cote)).filter((f): f is Forme => !!f);
  if (!fs.length) return null;
  const x0 = Math.min(...fs.map(f => f.x - f.rx)), x1 = Math.max(...fs.map(f => f.x + f.rx)), y0 = Math.min(...fs.map(f => f.y - f.ry)), y1 = Math.max(...fs.map(f => f.y + f.ry));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: Math.max(14, (x1 - x0) / 2 + 8), ry: Math.max(14, (y1 - y0) / 2 + 8) };
}

/* ---------- petite carte de Ma journée ---------- */
/* la vue choisie par les règles (ou par Corentin pour ce patient), sans numéros */
export async function mini(el: HTMLElement, D: Dossier) {
  const zs = zonesActives(D.zones);
  if (!zs.length) { el.remove(); return; }
  const def = vueParDefaut(zs);
  let v: Vue;
  if (def.region === "corps") {
    const nFace = zs.filter(z => formeSur(z.structure, "face", z.cote)).length, nDos = zs.filter(z => formeSur(z.structure, "dos", z.cote)).length;
    v = nDos >= nFace ? { planche: "dos", cadre: [0, 0, 218, 559] } : { planche: "face", cadre: [0, 0, 215, 561] };
  } else {
    const vues = vuesRegion(def.region, def.cote), i = D.vues?.[def.region] ?? meilleureVue(vues, zs);
    v = vues[i] ?? vues[0];
  }
  try { el.innerHTML = await planche(v, zs); } catch { el.remove(); }
}
export const aUneCarte = (D: Dossier) => zonesActives(D.zones).length > 0;

/* ---------- carte de la fiche ---------- */
const zoomDe = new Map<string, string | null>();          // région agrandie par dossier (null : corps entier ; absent : règle)
let bulle: { id: string; planche: string; x: number; y: number } | null = null;
let deplacer: { id: string; planche: string } | null = null;

export const aUnePanneau = (D: Dossier) => (D.zones ?? []).some(z => STRUCTURES[z.structure]);
export function panneau(D: Dossier): string {
  return aUnePanneau(D) ? `<section class="carte-corps" id="carte" aria-label="Carte du corps"><div class="cbarre"></div><div class="cvis"><p class="note">Chargement du dessin…</p></div><div class="clist"></div>
    <div class="legende-corps">${Object.entries(CATEGORIES).map(([c, n]) => `<span><b class="pas ${c}"></b>${n}</span>`).join("")}<span><b class="pas pain pale"></b>Pâle : va mieux</span></div>
    <details class="canciennes"></details>
    <p class="credit">Dessins : Servier Medical Art (CC BY 4.0), Patrick J. Lynch (CC BY 2.5), Sobotta 1909 (domaine public), adaptés aux couleurs de Muninn.</p></section>` : "";
}

const auj = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fr = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
async function changerZone(D: Dossier, id: string, f: (z: Zone) => Zone | null, message: string) {
  try {
    await db.modifierDossier(D.id, d => ({ ...d, zones: (d.zones ?? []).map(z => z.id === id ? f({ ...z }) : z).filter((z): z is Zone => !!z) }));
    toast(message);
  } catch { toast("L'enregistrement a échoué. Réessayez."); }
}

export async function brancher(racine: HTMLElement, D: Dossier, redessiner: () => void) {
  const box = racine.querySelector<HTMLElement>("#carte");
  if (!box) return;
  const actives = zonesActives(D.zones), anciennes = zonesAnciennes(D.zones);
  const def = vueParDefaut(actives);
  const choisie = zoomDe.has(D.id) ? zoomDe.get(D.id)! : def.region === "corps" ? null : def.region;
  const dansRegion = (z: Zone, r: string) => STRUCTURES[z.structure]?.region === r || !!STRUCTURES[z.structure]?.aussi?.includes(r);
  const region = choisie && actives.some(z => dansRegion(z, choisie)) ? choisie : null;
  const barre = box.querySelector<HTMLElement>(".cbarre")!, vis = box.querySelector<HTMLElement>(".cvis")!, liste = box.querySelector<HTMLElement>(".clist")!;
  const numeros = new Map(actives.map((z, i) => [z.id, i + 1] as const));

  if (!region) {
    barre.innerHTML = `<span class="etiq">Zones traitées · corps entier</span>`;
    const rs = regionsDe(actives).filter(r => r.region !== "corps");
    const cibles = (pl: string) => rs.map(r => ({ region: r.region, cote: r.cote, f: cibleRegion(actives.filter(z => dansRegion(z, r.region)), pl) })).filter((c): c is { region: string; cote: Zone["cote"]; f: Forme } => !!c.f);
    const [face, dos] = await Promise.all([planche({ planche: "face", cadre: [0, 0, 215, 561] }, actives, { cibles: cibles("face") }), planche({ planche: "dos", cadre: [0, 0, 218, 559] }, actives, { cibles: cibles("dos") })]);
    vis.innerHTML = `<div class="cduo"><div><span class="etiq">Face</span>${face}</div><div><span class="etiq">Dos</span>${dos}</div></div>`;
    liste.innerHTML = actives.length ? `<p class="note">${rs.length ? "Touchez une zone entourée pour l'agrandir." : ""}</p>` : `<p class="note">Aucune zone en cours.</p>`;
  } else {
    const cote = regionsDe(actives.filter(z => dansRegion(z, region)))[0]?.cote ?? "d";
    const vues = vuesRegion(region, cote), iv = Math.min(D.vues?.[region] ?? meilleureVue(vues, actives), vues.length - 1), v = vues[iv];
    barre.innerHTML = `<button class="retour" id="cretour"><span aria-hidden="true">←</span> Corps entier</button>${vues.length > 1
      ? `<div class="cvues" role="group" aria-label="Choisir la vue">${vues.map((x, i) => `<button data-cv="${i}" aria-pressed="${i === iv}">${esc(PLANCHES[x.planche].nom)}</button>`).join("")}</div>`
      : `<span class="etiq">${esc(NOMS_REGIONS[region] + nomCote(cote))}</span>`}`;
    vis.innerHTML = await planche(v, actives, { numeros });
    const ici = (z: Zone) => !!formeSur(z.structure, v.planche, z.cote);
    liste.innerHTML = actives.filter(z => dansRegion(z, region) || ici(z)).map(z => {
      const autre = ici(z) ? -1 : vues.findIndex(x => formeSur(z.structure, x.planche, z.cote));
      return `<button ${ici(z) ? `data-z="${esc(z.id)}" data-pl="${v.planche}"` : `data-cv="${autre}"`} class="${z.mieux ? "pale" : ""}${ici(z) ? "" : " ailleurs"}"><span class="n ${z.cat}">${numeros.get(z.id)}</span>${esc(z.nom)}${ici(z) ? "" : autre >= 0 ? ` <small>· voir ${esc(PLANCHES[vues[autre].planche].nom)}</small>` : ""}</button>`;
    }).join("");
    vis.querySelector("svg")?.classList.toggle("en-deplacement", !!deplacer);
  }
  box.querySelector<HTMLElement>(".canciennes")!.innerHTML = anciennes.length
    ? `<summary>Anciennes zones douloureuses (${anciennes.length})</summary>${anciennes.map(z => `<div class="cancienne"><span><b class="pas ${z.cat}"></b><b>${esc(z.nom)}</b> · apparue le ${fr(z.depuis)}${z.fin ? `, disparue le ${fr(z.fin)}` : `, enlevée à la main le ${fr(z.enlevee!)}`}</span><button data-remettre="${esc(z.id)}">Remettre</button></div>`).join("")}`
    : `<summary>Anciennes zones douloureuses</summary><p class="note">Aucune pour l'instant. Une zone qui ne fait plus mal, ou enlevée par erreur, arrive ici.</p>`;

  /* bulle d'une zone */
  box.querySelectorAll(".cbulle").forEach(b => b.remove());
  const z = bulle && actives.find(x => x.id === bulle!.id);
  if (bulle && z) {
    const f = formeSur(z.structure, bulle.planche, z.cote), bouge = !!f && (z.cat === "frac" || z.cat === "nerf" || (PLANCHES[bulle.planche].image === true && !f.d));
    const b = document.createElement("div"); b.className = "cbulle"; b.style.left = bulle.x + "px"; b.style.top = bulle.y + "px";
    b.innerHTML = `<b>${esc(z.nom)}</b><div class="q">${CATEGORIES[z.cat]}${z.mieux ? `, va mieux depuis le ${fr(z.mieux)}` : ""} · depuis ${z.source === "bilan" ? "le bilan" : z.source === "main" ? "votre ajout" : "la séance"} du ${fr(z.depuis)}</div>
      <div class="row"><button class="danger" data-c="enlever">Enlever</button>${bouge ? `<button data-c="deplacer">Déplacer</button>` : ""}<button data-c="garder">Garder</button></div>
      <button class="lien" data-c="signaler">Le dessin est faux ? Me le signaler</button>`;
    box.append(b);
    const id = z.id, pl = bulle.planche;
    b.querySelector<HTMLElement>('[data-c="enlever"]')!.onclick = () => { bulle = null; changerZone(D, id, x => ({ ...x, enlevee: auj(), maj: new Date().toISOString() }), "Zone enlevée. « Remettre » dans les anciennes zones si c'était une erreur."); };
    b.querySelector<HTMLElement>('[data-c="garder"]')!.onclick = () => { bulle = null; redessiner(); };
    const dep = b.querySelector<HTMLElement>('[data-c="deplacer"]');
    if (dep) dep.onclick = () => { bulle = null; deplacer = { id, planche: pl }; toast("Faites glisser le repère à sa place, puis lâchez."); redessiner(); };
    b.querySelector<HTMLElement>('[data-c="signaler"]')!.onclick = async () => {
      bulle = null;
      try {
        const l = (await db.lireParametre<{ liste: unknown[] }>("retours_dessins"))?.liste ?? [];
        await db.ecrireParametre("retours_dessins", { liste: [...l, { structure: z.structure, cote: z.cote, planche: pl, nom: z.nom, quand: new Date().toISOString() }].slice(-100) });
        toast("Noté : ce dessin sera corrigé. Le retour est gardé dans les Réglages, « Retours sur les dessins ».");
      } catch { toast("L'enregistrement a échoué. Réessayez."); }
      redessiner();
    };
  }

  /* touchers */
  box.onclick = e => {
    const t = e.target as Element;
    if (glisse || t.closest(".cbulle")) return;
    const ret = t.closest("#cretour"); if (ret) { zoomDe.set(D.id, null); bulle = null; deplacer = null; redessiner(); return; }
    const cv = t.closest<HTMLElement>("[data-cv]");
    if (cv && region) { bulle = null; const i = Number(cv.dataset.cv); if (i >= 0) db.modifierDossier(D.id, d => ({ ...d, vues: { ...(d.vues ?? {}), [region]: i } })).catch(() => toast("L'enregistrement a échoué.")); return; }
    const zr = t.closest<SVGElement>("[data-zoom]");
    if (zr) { zoomDe.set(D.id, zr.dataset.zoom!); bulle = null; redessiner(); return; }
    const rem = t.closest<HTMLElement>("[data-remettre]");
    if (rem) { const id = rem.dataset.remettre!; changerZone(D, id, x => { const { fin: _f, enlevee: _e, mieux: _m, ...r } = x; return { ...r, maj: new Date().toISOString() }; }, "Zone remise sur le dessin."); return; }
    const zz = t.closest<HTMLElement | SVGElement>("[data-z]");
    if (zz && !deplacer) {
      const p = box.getBoundingClientRect(), w = Math.min(280, p.width * .85), me = e as MouseEvent;
      bulle = { id: zz.dataset.z!, planche: zz.dataset.pl!, x: Math.max(8, Math.min(me.clientX - p.left + 12, p.width - w - 8)), y: Math.max(50, Math.min(me.clientY - p.top - 20, p.height - 170)) };
      redessiner(); return;
    }
    if (bulle) { bulle = null; redessiner(); }
  };
  /* glisser vers la droite : retour au corps entier ; en mode déplacement, faire glisser le repère */
  let x0: number | null = null, y0 = 0, glisse = false, prise: { svg: SVGSVGElement; m: DOMMatrix; x: number; y: number; d0: [number, number]; nd?: [number, number] } | null = null;
  box.onpointerdown = e => {
    x0 = e.clientX; y0 = e.clientY; glisse = false;
    if (!deplacer) return;
    const svg = (e.target as Element).closest<SVGSVGElement>("svg.pl"); if (!svg) return;
    e.preventDefault();
    const zd = (D.zones ?? []).find(x => x.id === deplacer!.id);
    prise = { svg, m: svg.getScreenCTM()!, x: e.clientX, y: e.clientY, d0: zd?.decal?.[deplacer.planche] ?? [0, 0] };
    svg.setPointerCapture(e.pointerId);
  };
  box.onpointermove = e => {
    if (!prise || !deplacer) return;
    const nd: [number, number] = [prise.d0[0] + (e.clientX - prise.x) / prise.m.a, prise.d0[1] + (e.clientY - prise.y) / prise.m.d];
    prise.nd = nd;
    prise.svg.querySelectorAll(`[data-z="${CSS.escape(deplacer.id)}"]`).forEach(g => g.setAttribute("transform", `translate(${nd[0]} ${nd[1]})`));
  };
  box.onpointerup = e => {
    if (prise && deplacer) {
      const { id, planche: pl } = deplacer, nd = prise.nd;
      prise = null; deplacer = null; glisse = true; setTimeout(() => { glisse = false; }, 60);
      if (nd) changerZone(D, id, x => ({ ...x, decal: { ...(x.decal ?? {}), [pl]: [Math.round(nd[0] * 10) / 10, Math.round(nd[1] * 10) / 10] }, maj: new Date().toISOString() }), "Repère déplacé : votre placement fait foi pour ce patient.");
      else redessiner();
      return;
    }
    if (x0 === null) return;
    const dx = e.clientX - x0, dy = Math.abs(e.clientY - y0); x0 = null;
    if (region && dx > 70 && dy < 60 && e.pointerType !== "mouse") { glisse = true; setTimeout(() => { glisse = false; }, 60); zoomDe.set(D.id, null); bulle = null; redessiner(); }
  };
}

/* ---------- Réglages : retours sur les dessins (à transmettre pour corriger les planches) ---------- */
export async function retours(): Promise<string> {
  const l = (await db.lireParametre<{ liste: { structure: string; cote: string; planche: string; nom: string; quand: string }[] }>("retours_dessins"))?.liste ?? [];
  return l.length ? `<fieldset class="regligne"><legend>Retours sur les dessins</legend><ul>${l.slice(-20).reverse().map(r => `<li>${esc(r.nom)} · ${esc(PLANCHES[r.planche]?.nom ?? r.planche)} · le ${fr(r.quand.slice(0, 10))}</li>`).join("")}</ul><p class="note">Lisez-les à Claude pour corriger les planches : la correction vaudra pour tous les patients.</p></fieldset>` : "";
}

/* ---------- Réglages : remplir une fois les cartes des patients déjà suivis (2.1.0) ---------- */
let rattrapageEnCours = "";
export async function rattrapage(zone: HTMLElement) {
  if (rattrapageEnCours) { zone.insertAdjacentHTML("afterbegin", `<fieldset class="regligne"><legend>Carte du corps</legend><p class="note" aria-live="polite">${esc(rattrapageEnCours)}</p></fieldset>`); return; }
  const n = (await moteur.aRemplir()).length;
  if (!n) return;
  zone.insertAdjacentHTML("afterbegin", `<fieldset class="regligne" id="rattrapage"><legend>Carte du corps</legend>
    <p class="note">${n === 1 ? "Un patient en soins n'a pas encore de zones sur sa carte." : n + " patients en soins n'ont pas encore de zones sur leur carte."} Muninn peut les remplir d'un coup : une demande légère par patient (résumé du bilan et séances du dernier mois ; vos marques au stylet ne sont pas relues). Cela utilise un peu de votre abonnement Claude.</p>
    <div class="row"><button class="primary" id="rattrapagego">Remplir les cartes du corps</button></div><p class="note" id="rattrapageetat" aria-live="polite"></p></fieldset>`);
  const go = zone.querySelector<HTMLButtonElement>("#rattrapagego")!, etat = zone.querySelector<HTMLElement>("#rattrapageetat")!;
  go.onclick = async () => {
    go.disabled = true;
    rattrapageEnCours = "Remplissage des cartes en cours…";
    const r = await moteur.remplirCartes(x => { rattrapageEnCours = etat.textContent = `En cours : ${x.faits} sur ${x.total}…${x.erreurs ? ` (${x.erreurs} à reprendre)` : ""} Vous pouvez continuer à utiliser l'appli ; gardez-la ouverte.`; });
    rattrapageEnCours = "";
    if (!r) { go.disabled = false; etat.textContent = "L'IA n'est pas réglée : voyez « État de l'appli »."; return; }
    etat.textContent = `Terminé : ${r.faits} carte${r.faits > 1 ? "s" : ""} remplie${r.faits > 1 ? "s" : ""}${r.sansZone ? ` (dont ${r.sansZone} sans zone repérée)` : ""}.${r.erreurs ? ` ${r.erreurs} n'ont pas abouti : touchez de nouveau le bouton pour les reprendre.` : ""}`;
    go.disabled = !r.erreurs;
    toast("Cartes du corps remplies.");
  };
}
