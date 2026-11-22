/* Habillage pour captures : nouvelle direction artistique posée sur la vraie appli (rien n'est enregistré). */
(() => {
const css = `
:root[data-theme="dark"]{--bg:#060407;--panel:rgba(30,12,24,.62);--ink:#fff4ec;--soft:#cfa9a6;--line:rgba(255,110,170,.22);
 --accent:#ff4f9a;--accent-ink:#1a0610;--accent-bg:rgba(255,79,154,.14);--warn:#ffb547;--warn-bg:rgba(255,181,71,.12);
 --acc2:#ffb23e;--card2:rgba(60,20,40,.45);--glow:rgba(255,79,154,.55);
 --pain:#ff5a5f;--raide:#5fb4ff;--nerf:#ffe94f;--frac:#fff;--op:#fff;--ok:#6fdc9f;--work:#ffb547;
 --plaque:#ffa078;--plaqueTrait:rgba(255,185,145,.8)}
body{background:radial-gradient(700px 480px at 92% 0%,rgba(255,79,154,.26),transparent 70%),radial-gradient(800px 520px at 0% 100%,rgba(255,140,40,.18),transparent 70%),#060407 fixed!important}
.panel{backdrop-filter:blur(16px);border-radius:20px}
.main{background:rgba(18,8,14,.55)}
h2,.jnom,.nomappli{font-family:"Lexend",sans-serif}
.head h2{font-size:1.9rem}
#main>.head h2:only-child,.jtitre{background:linear-gradient(90deg,#ff4f9a,#ff8a3d 55%,#ffd84a);-webkit-background-clip:text;background-clip:text;color:transparent}
button.primary,.primary{background:linear-gradient(120deg,#ff4f9a,#ff8a3d 60%,#ffc93e)!important;color:#1a0610!important;border:0!important;box-shadow:0 0 18px rgba(255,79,154,.45)}
.outil{border-radius:16px!important}
.jchoix button[aria-pressed=true]{background:linear-gradient(120deg,#ff4f9a,#ffb23e)!important;color:#1a0610!important;border-color:transparent!important}
/* Ma journée : 6 fiches avec petit corps */
.jcartes{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-auto-rows:1fr;gap:16px!important}
.jcarte{display:grid!important;grid-template-columns:minmax(0,1fr) 140px;grid-template-areas:"txt mini" "bas mini";grid-template-rows:1fr auto;gap:10px;padding:16px 16px 14px 18px!important;border-radius:18px!important;
 background:rgba(30,12,24,.62)!important;border:1px solid rgba(255,110,170,.22)!important;border-left:3px solid #ff4f9a!important;text-align:left;min-height:300px}
.jtxt{grid-area:txt;display:flex;flex-direction:column;gap:8px;min-width:0}
.jcarte .javant{display:none}
.jcarte .jregion{color:var(--acc2);font-weight:700}
.jobj .e,.jbas .e{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--soft)}
.jobj .e{color:var(--accent)}
.jobj div{font-size:16.5px;line-height:1.35}
.jcarte .jprevu{background:rgba(60,20,40,.45)!important;border-radius:12px;margin:0}
.jpuces{display:flex;gap:6px;flex-wrap:wrap}.jpuces span{font-size:13.5px;padding:2px 10px;border-radius:999px;border:1px solid var(--line);color:var(--soft)}
.jbas{grid-area:bas;margin-top:4px;display:flex;align-items:flex-end;gap:10px}
.jbas .g{font:700 26px/1 "Lexend",sans-serif}.jbas .g small{font-size:14px;color:var(--soft);font-weight:400}
.jbas .v{margin-left:auto;text-align:right}
.jmini{grid-area:mini;display:flex;align-items:center;justify-content:center;min-height:0}
.jmini svg{width:100%;height:100%;max-height:280px}
/* planches teintées */
.pl[data-pl] .pf{fill:var(--plaque)}.pl[data-pl] .pt{fill:var(--plaqueTrait)}
.pl[data-pl] [stroke]:not([data-o]){stroke:var(--plaqueTrait);vector-effect:non-scaling-stroke;stroke-width:.9px}
/* fiche : infos à gauche, corps à droite */
.fiche2{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:22px;align-items:start}
.corpsbox{position:sticky;top:0;display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:18px;background:rgba(30,12,24,.62);border:1px solid var(--line);height:calc(100dvh - 200px);min-height:560px}
.corpsbox .barre{display:flex;justify-content:space-between;align-items:center;gap:10px}
.corpsbox .etq{font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--soft)}
.vues{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--card2);border:1px solid var(--line)}
.vues span{font-weight:700;font-size:15px;color:var(--soft);border-radius:999px;padding:8px 14px}
.vues span.on{background:linear-gradient(120deg,#ff4f9a,#ffb23e);color:#1a0610}
.corpsvis{flex:1;min-height:0;display:flex;justify-content:center}.corpsvis svg{width:100%;height:100%}
.zl{display:flex;flex-wrap:wrap;gap:6px 8px}.zl span{display:inline-flex;align-items:center;gap:8px;font-size:15px;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 5px}
.zl i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;font-style:normal;font-weight:700;font-size:13px;color:#140a10}
.zl span.ail{opacity:.6;border-style:dashed}.zl small{color:var(--soft)}
.lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;color:var(--soft)}.lg b{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:0}
.cr{font-size:11.5px;color:var(--soft);opacity:.8}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
.stats>div{background:rgba(30,12,24,.62);border:1px solid var(--line);border-radius:16px;padding:10px 14px}
.stats .e{font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:var(--soft)}
.stats .l{display:flex;align-items:flex-end;justify-content:space-between;gap:6px;flex-wrap:wrap}
.stats .g{font:700 28px/1.1 "Lexend",sans-serif}.stats .g small{font-size:14px;color:var(--soft);font-weight:400}
.stats .t{font-size:13.5px;font-weight:700;color:var(--ok);margin-top:4px}.stats .t small{color:var(--soft);font-weight:400}
.objectifs li{list-style:none;display:flex;gap:10px;align-items:flex-start;margin:4px 0}.objectifs ul{padding-left:4px}
.objectifs li::before{content:"";flex:none;width:20px;height:20px;border:2px solid var(--soft);border-radius:5px;margin-top:2px}
#main .chips{display:none}
#main .rdv{display:flex!important;align-items:center;justify-content:flex-start;gap:12px;flex-wrap:nowrap!important}#main .rdv>span{flex:0 1 auto;min-width:0}#main .rdv>button{flex:none}
@media (max-width:820px){.fiche2{grid-template-columns:minmax(0,1fr)}.corpsbox,.fiche2>div{min-width:0;max-width:100%}.corpsbox{position:static;height:520px;min-height:0;order:-1}
 .jcartes{grid-template-columns:1fr!important}.jcarte{grid-template-columns:minmax(0,1fr) 44%;grid-template-areas:"txt mini" "bas bas";min-height:0}.jmini svg{max-height:240px;min-height:200px}.jbas{border-top:1px solid var(--line);padding-top:10px}.stats{grid-template-columns:1fr 1fr 1fr}.stats .g{font-size:22px}.corpsbox .barre{flex-direction:column;align-items:stretch}.vues{justify-content:space-between}.vues span{padding:8px 10px;font-size:14px;white-space:nowrap}.zl small{white-space:nowrap}}
`;
const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
document.documentElement.dataset.theme = "dark";

/* ---------- dessins ---------- */
const rgbVar = v => { const d = document.createElement("i"); d.style.color = `var(${v})`; document.body.appendChild(d); const m = getComputedStyle(d).color.match(/[\d.]+/g).map(Number); d.remove(); return m.slice(0, 3).map(x => x / 255); };
const mat = ([r, g, b], k, c0) => `0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${-.3 * k} ${-.59 * k} ${-.11 * k} ${k} ${c0}`;
const IM = {
  profil: { W: 1205, H: 1424, mu: {
    masseter: "M380 648 C400 644 420 642 440 642 C432 700 428 780 436 860 C444 920 458 960 472 992 C460 1000 448 1002 440 1000 C410 985 390 960 380 930 C366 880 364 790 368 730 C370 700 374 670 380 648 Z",
    masseterTout: "M385 640 C450 630 540 626 596 634 C604 700 596 800 584 900 C578 950 572 985 566 1000 C530 1012 490 1012 462 1004 C430 990 402 966 384 930 C368 880 366 800 370 740 C372 700 378 664 385 640 Z",
    temporal: "M352 470 C352 410 390 330 450 292 C520 252 620 244 712 258 C800 274 870 320 904 400 C922 450 912 520 880 566 C840 600 780 606 720 604 C660 604 600 610 540 614 C480 616 420 606 382 578 C360 552 352 510 352 470 Z" } },
  bras: { W: 821, H: 1000, mu: {
    deltmoy: "M200 215 C260 205 330 205 380 212 L350 885 C330 892 305 892 290 880 Z",
    deltpost: "M380 212 C440 215 500 225 540 245 C560 300 565 400 555 500 C530 640 460 780 350 885 Z",
    trapeze: "M135 185 C200 140 300 95 470 95 C485 130 490 170 490 205 C400 200 250 200 135 210 Z" } },
};
let n = 0;
function raster(k, vb, zones, zoom) {
  const I = IM[k], s = "h" + (++n), src = IMGDATA[k], vbw = +vb.split(" ")[2];
  let d = `<filter id="t${s}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${mat(rgbVar("--plaque"), .95, 0)}"/></filter><filter id="fl${s}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${vbw * .012}"/></filter>`;
  for (const c of ["pain", "raide", "nerf"]) d += `<filter id="f${c}${s}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${mat(rgbVar("--" + c), 1.5, .15)}"/></filter>`;
  let h = "", b = "";
  zones.forEach(z => {
    if (z.mu) { d += `<clipPath id="c${z.mu}${s}"><path d="${I.mu[z.mu]}"/></clipPath>`;
      h += `<g clip-path="url(#c${z.mu}${s})"><rect width="${I.W}" height="${I.H}" fill="#000" opacity=".55"/><image href="${src}" width="${I.W}" height="${I.H}" filter="url(#f${z.c}${s})"/></g><path d="${I.mu[z.mu]}" fill="none" stroke="var(--${z.c})" stroke-width="${vbw * .005}" style="filter:drop-shadow(0 0 ${vbw * .01}px var(--${z.c}))"/>${z.tout ? `<path d="${I.mu[z.tout]}" fill="none" stroke="var(--${z.c})" stroke-width="${vbw * .004}" stroke-dasharray="${vbw * .016} ${vbw * .011}"/>` : ""}`; }
    else if (z.nerf) h += `<path d="${z.nerf}" fill="none" stroke="var(--nerf)" stroke-width="${vbw * .03}" opacity=".45" filter="url(#fl${s})"/><path d="${z.nerf}" fill="none" stroke="var(--nerf)" stroke-width="${vbw * .009}" stroke-dasharray="${vbw * .022} ${vbw * .01}" stroke-linecap="round"/>`;
    else h += `<ellipse cx="${z.x}" cy="${z.y}" rx="${z.r * 2.6}" ry="${z.r * 2.6}" fill="var(--${z.c})" opacity=".45" filter="url(#fl${s})"/><circle cx="${z.x}" cy="${z.y}" r="${z.r * .6}" fill="var(--${z.c})" stroke="#fff" stroke-width="${vbw * .003}"/>`;
    if (zoom && z.n) { const r = vbw * .028; b += `<circle cx="${z.bx}" cy="${z.by}" r="${r}" fill="var(--${z.c})" stroke="#fff" stroke-opacity=".8" stroke-width="${r * .14}"/><text x="${z.bx}" y="${z.by + r * .38}" text-anchor="middle" font-size="${r * 1.1}" font-weight="700" fill="#140a10">${z.n}</text>`; }
  });
  return `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"><defs>${d}</defs><image href="${src}" width="${I.W}" height="${I.H}" filter="url(#t${s})"/>${h}${b}</svg>`;
}
function servier(pl, vb, zones, zoom) {
  const box = document.createElement("div"); box.innerHTML = REEL.planche(pl, vb); const svg = box.firstElementChild;
  document.body.appendChild(box); REEL.peindre(svg, zones); box.remove();
  if (zoom) { const vbw = svg.viewBox.baseVal.width, r = vbw * .028; let b = "";
    zones.forEach(z => { if (z.n) b += `<circle cx="${z.x}" cy="${z.y}" r="${r}" fill="var(--${z.c})" stroke="#fff" stroke-opacity=".8" stroke-width="${r * .14}" data-o="1"/><text x="${z.x}" y="${z.y + r * .38}" text-anchor="middle" font-size="${r * 1.1}" font-weight="700" fill="#140a10">${z.n}</text>`; });
    svg.insertAdjacentHTML("beforeend", b); }
  return svg.outerHTML;
}
const spark = (v, w = 70, hgt = 28) => { const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1; const p = v.map((y, i) => [3 + i * (w - 6) / (v.length - 1), hgt - 6 - (y - lo) / sp * (hgt - 12)]);
  return `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><polyline points="${p.map(q => q.join(",")).join(" ")}" fill="none" stroke="#ffb23e" stroke-width="2" opacity=".75"/>${p.map((q, i) => `<circle cx="${q[0]}" cy="${q[1]}" r="${i === p.length - 1 ? 3.6 : 2.2}" fill="${i === p.length - 1 ? "#ff4f9a" : "#ffb23e"}"/>`).join("")}</svg>`; };

/* ---------- données de démonstration ---------- */
const D = {
  lucie: { obj: "Travailler 2 h sur écran sans douleur", nb: 1, pro: "lun. 30", eva: [6, 6, 5], val: ["Rotation", "60°"], mini: () => servier("dos", "68 58 82 96", [{ pl: "dos", x: 109, y: 86, rx: 6, ry: 9, c: "pain", peint: 1 }, { pl: "dos", x: 90, y: 103, rx: 11, ry: 5, c: "raide", peint: 1 }, { pl: "dos", x: 128, y: 103, rx: 11, ry: 5, c: "raide", peint: 1 }]) },
  marc: { obj: "Élévation active à 150° en mars", nb: 9, pro: "lun. 30", eva: [7, 6, 5, 4], val: ["Élévation", "100°"], mini: () => servier("face", "126 88 82 112", [{ pl: "face", x: 178, y: 130, rx: 8, ry: 13, c: "pain", peint: 1 }]) },
  stephanie: { obj: "Dormir sur le côté droit d'ici 6 semaines", nb: 6, pro: "jeu. 26", eva: [6, 6, 5, 4], val: ["Élévation", "135°"], mini: () => servier("dos", "114 86 86 112", [{ pl: "dos", x: 151, y: 143, rx: 11, ry: 9, c: "pain", peint: 1 }, { pl: "dos", x: 137, y: 104, rx: 13, ry: 5, c: "raide", peint: 1 }]) },
  jeanmarc: { obj: "Marcher 45 minutes sans s'arrêter", nb: 12, pro: "jeu. 26", eva: [7, 7, 6, 6, 6], val: ["Marche", "20 min"], mini: () => servier("dos", "0 0 218 559", [{ pl: "dos", x: 109, y: 246, rx: 15, ry: 9, c: "pain", peint: 1 }, { pl: "dos", nerf: "M104 252 C98 268 93 284 92 300 C90 330 90 370 89 400 C88 420 88 440 88 470 C88 490 87 505 86 520" }]) },
  ines: { obj: "Croquer une pomme, douleur 2/10 au plus", nb: 4, pro: "lun. 30", eva: [7, 6, 6, 5], val: ["Ouverture", "32 mm"], mini: () => raster("profil", "0 30 1205 1370", [{ mu: "temporal", c: "raide" }, { mu: "masseter", c: "pain" }, { x: 626, y: 672, r: 22, c: "pain" }]),
    stats: [["Douleur", "/10", [7, 6, 6, 5], "↘ moins de douleur", "dit le 20/11"], ["Ouverture", " mm", [24, 27, 30, 32]]],
    vues: ["Profil droit", "Face"], titre: "Tête",
    corps: () => raster("profil", "0 30 1205 1370", [{ mu: "temporal", c: "raide", n: 3, bx: 560, by: 440 }, { mu: "masseter", tout: "masseterTout", c: "pain", n: 2, bx: 404, by: 820 }, { x: 626, y: 672, r: 22, c: "pain", n: 1, bx: 690, by: 700 }, { nerf: "M626 668 C640 620 646 560 650 500 C656 430 690 360 740 300", c: "nerf", n: 4, bx: 780, by: 300 }], true),
    liste: [[1, "pain", "ATM droite"], [2, "pain", "Masséter droit"], [3, "raide", "Temporal droit (tendu)"], [4, "nerf", "Irradiation vers la tempe"]] },
  paul: { obj: "Jouer 1 h au tennis en double sans douleur", nb: 3, pro: "jeu. 26", eva: [8, 7, 7, 6], val: ["Élévation", "120°"], mini: () => raster("bras", "0 60 821 900", [{ mu: "deltpost", c: "pain" }, { mu: "trapeze", c: "raide" }]),
    stats: [["Douleur", "/10", [8, 7, 7, 6]], ["Élévation", "°", [90, 100, 110, 120], "↗ lève mieux le bras", "dit le 19/11"]],
    vues: ["Face", "Profil droit", "Dos"], on: 1, titre: "Épaule droite",
    corps: () => raster("bras", "0 60 821 900", [{ mu: "deltpost", c: "pain", n: 1, bx: 470, by: 480 }, { mu: "trapeze", c: "raide", n: 2, bx: 320, by: 150 }], true),
    liste: [[1, "pain", "Deltoïde droit, faisceau postérieur"], [2, "raide", "Trapèze supérieur droit"], [3, "raide", "Grand pectoral droit, chef claviculaire", "Face"]] },
};

window.__journee = () => {
  document.querySelectorAll(".jcarte").forEach(c => {
    const p = D[c.dataset.patient]; if (!p) return;
    const t = document.createElement("div"); t.className = "jtxt";
    const prevu = c.querySelector(".jprevu");
    t.append(c.querySelector(".jtete"), c.querySelector(".jregion"));
    t.insertAdjacentHTML("beforeend", `<div class="jobj"><span class="e">🎯 Objectif</span><div>${p.obj}</div></div>`);
    t.append(prevu);
    t.insertAdjacentHTML("beforeend", `<div class="jpuces"><span>${p.nb} séance${p.nb > 1 ? "s" : ""}</span><span>Prochain : ${p.pro}</span></div>`);
    c.insertAdjacentHTML("beforeend", `<div class="jpucesX" hidden><span>${p.nb} séance${p.nb > 1 ? "s" : ""}</span><span>Prochain : ${p.pro}</span></div>
      <div class="jbas"><div><div class="e">Douleur</div><div class="g">${p.eva.at(-1)}<small>/10</small></div></div>${spark(p.eva)}<div class="v"><div class="e">${p.val[0]}</div><div class="g">${p.val[1]}</div></div></div>`);
    c.prepend(t); c.insertAdjacentHTML("beforeend", `<div class="jmini">${p.mini()}</div>`);
  });
  const h = document.querySelector("#main .head h2"); if (h) h.classList.add("jtitre");
};
window.__fiche = id => {
  const p = D[id], m = document.querySelector("#main"); if (!p) return;
  const head = m.querySelector(".head"), rdv = m.querySelector(".rdv");
  const gauche = document.createElement("div");
  [...m.children].filter(e => e !== head && e !== rdv).forEach(e => gauche.append(e));
  const ch = gauche.querySelector(".chips");
  ch.insertAdjacentHTML("beforebegin", `<div class="stats">${p.stats.map(([e, u, v, tt, td]) => `<div><div class="e">${e}</div><div class="l"><div class="g">${v.at(-1)}<small>${u}</small></div>${spark(v, 110, 36)}</div>${tt ? `<div class="t">${tt} <small>· ${td}, sans chiffre</small></div>` : ""}</div>`).join("")}<div><div class="e">Séances</div><div class="g">${p.nb}</div></div></div>`);
  const droite = document.createElement("div"); droite.className = "corpsbox";
  droite.innerHTML = `<div class="barre"><span class="etq">${p.titre}</span><div class="vues">${p.vues.map((v, i) => `<span class="${i === (p.on || 0) ? "on" : ""}">${v}</span>`).join("")}</div></div>
    <div class="corpsvis">${p.corps()}</div>
    <div class="zl">${p.liste.map(([k, c, t, ail]) => `<span class="${ail ? "ail" : ""}"><i style="background:var(--${c})">${k}</i>${t}${ail ? ` <small>· voir ${ail}</small>` : ""}</span>`).join("")}</div>
    <div class="lg"><span><b style="background:var(--pain)"></b>Douloureux</span><span><b style="background:var(--raide)"></b>Raideur</span><span><b style="background:var(--nerf);border-radius:2px;width:18px;height:4px;vertical-align:3px"></b>Trajet nerveux</span><span><b style="background:#fff;border-radius:1px;width:16px;height:3px;vertical-align:3px"></b>Fracture</span><span><b style="background:var(--pain);opacity:.35"></b>Pâle : va mieux</span></div>
    <div class="cr">Dessins : Servier Medical Art, Patrick J. Lynch, Sobotta (1909), adaptés.</div>`;
  const g = document.createElement("div"); g.className = "fiche2"; g.append(gauche, droite);
  m.append(g);
  if (matchMedia("(max-width:820px)").matches) { const o = gauche.querySelector(".objectifs"); if (o) m.insertBefore(o, g); o && (o.style.marginBottom = "14px"); }
};
})();
