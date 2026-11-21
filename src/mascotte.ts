/* Muninn, le corbeau : emblème et mascotte de l'appli, toute l'année, sur sa branche
   (en haut de la colonne de gauche sur la tablette, à côté du titre sur le téléphone). Il porte le chapeau de saison.
   C'est une marionnette : le corbeau peint (images de public/corbeau/) est découpé en pièces (corps, aile, queue,
   cou, tête, ailes ouvertes, tête bec ouvert, tête endormie, et une vue de face corps + tête) que l'on anime chacune.
   Le rouge des images est le « repère » : chaque pièce a un masque (-l.webp) peint à la couleur de l'ambiance (--accent).
   Il reste dans son cadre (seuls le bout des ailes et le bec peuvent en dépasser un peu) : il respire, cligne des yeux,
   et de temps en temps fait un geste tiré au hasard, jamais deux fois le même de suite ; le soir, il somnole plus souvent.
   Touché, il croasse, s'étire ou saute. */

const DOSSIER = `${import.meta.env.BASE_URL}corbeau/`;
const SOIR = 20;   // comme « Ma journée » : à partir de 20 h, la journée est finie

const calque = (n: string) =>
  `<div class="calque c-${n}"><img src="${DOSSIER}${n}.webp" alt="" draggable="false"><i style="--m:url(${DOSSIER}${n}-l.webp)"></i></div>`;

/* chapeaux de saison (même dessin qu'avant, posés sur la tête de profil et sur la tête de face) */
const CHAPEAUX = `<svg class="chapeaux" viewBox="6 -24 52 44" aria-hidden="true">
  <g class="chapeau h-sorciere"><path d="M14 13q18-6 36 0l-3 3q-15-4-30 0z" fill="#3B2A4A"/><path d="M21 13q4-15 18-22-2 9 4 21q-11-2-22 1z" fill="#3B2A4A"/><path d="M21.5 11.5q10-2.5 21-.5l-.4 3q-10-2-20 .3z" fill="var(--accent)"/></g>
  <g class="chapeau h-bonnet"><path d="M14 14q4-14 20-16q12 0 16 14z" fill="#D32F2F"/><path d="M34-2q12-2 16 10" fill="none" stroke="#D32F2F" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="13" r="4.5" fill="#FFFFFF"/><rect x="12" y="11" width="40" height="7" rx="3.5" fill="#FFFFFF"/></g>
  <g class="chapeau h-oreilles"><ellipse cx="24" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(-12 24 -2)"/><ellipse cx="40" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(12 40 -2)"/><ellipse cx="24" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(-12 24 -1)"/><ellipse cx="40" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(12 40 -1)"/></g>
  <g class="chapeau h-fete"><path d="M24 11l9-21 9 21z" fill="var(--accent)"/><path d="M27 4l12 0M25.5 8l15 0M29 0l8 0" stroke="#F7C948" stroke-width="2"/><circle cx="33" cy="-11" r="3.2" fill="#F7C948"/></g>
</svg>`;

const OISEAU = `<span class="c-pos"><span class="c-ombre g"></span><span class="c-ombre d"></span><span class="c-sens"><span class="c-groupe">
  <span class="c-profil">
    <span class="piece p-aile-loin">${calque("aile-loin")}</span>
    <span class="piece p-queue">${calque("queue")}</span>
    <span class="piece p-corps">${calque("corps")}</span>
    <span class="piece p-aile">${calque("aile")}</span>
    <span class="piece p-aile-ouverte">${calque("aile-ouverte")}</span>
    <span class="piece p-nuque">${calque("nuque")}</span>
    <span class="piece p-cou">${calque("cou")}</span>
    <span class="piece p-tete">${calque("tete")}<span class="paup"></span>${calque("tete-cri")}${calque("tete-dort")}${CHAPEAUX}</span>
  </span>
  <span class="c-face">${calque("face-corps")}<span class="piece p-ftete">${calque("face-tete")}<span class="paup p1"></span><span class="paup p2"></span>${CHAPEAUX}</span></span>
  <span class="c-zz"></span>
</span></span></span>`;

const PERCHOIR = `<span class="perchoir" aria-hidden="true"><img src="${DOSSIER}branche.webp" alt="" draggable="false"><i style="--m:url(${DOSSIER}branche-l.webp)"></i></span>`;

const DOUX = "cubic-bezier(.45,0,.25,1)";
const dors = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function installer(place: HTMLElement) {
  const duo = document.createElement("div");
  duo.className = "compagnon";
  duo.innerHTML = PERCHOIR + `<button type="button" class="corbeau" aria-label="Muninn, le petit corbeau (touchez-le)">${OISEAU}<span class="c-bulle" aria-hidden="true">Croâ !</span></button>`;
  place.replaceWith(duo);
  const b = duo.querySelector<HTMLElement>(".corbeau")!;
  const $ = (s: string) => b.querySelector<HTMLElement>(s)!;
  const calme = matchMedia("(prefers-reduced-motion: reduce)");

  /* joue une animation et attend sa fin (fill: forwards garde la pose ; les poses sont réécrites à chaque geste) */
  const A = (s: string, images: Keyframe[], ms: number, o: KeyframeAnimationOptions = {}) =>
    Promise.all([...b.querySelectorAll<HTMLElement>(s)].map(e =>
      e.animate(images, { duration: ms, easing: DOUX, fill: "forwards", ...o }).finished.catch(() => undefined)));
  const vis = (s: string, o: number, ms = 60) => A(s, [{ opacity: o }], ms, { easing: "linear" });
  const corps = (images: Keyframe[], ms: number) => A(".c-groupe", images, ms, { fill: "none", composite: "add" });
  const tete = (deg: number, ms: number, dx = 0, dy = 0) => Promise.all([
    A(".p-tete", [{ transform: `translate(${dx}%,${dy}%) rotate(${deg}deg)` }], ms),
    A(".p-cou", [{ transform: `translate(${dx / 2}%,${dy / 2}%) rotate(${deg / 2}deg)` }], ms),
    A(".p-nuque", [{ transform: `translate(${dx / 4}%,${dy / 4}%) rotate(${deg / 4}deg)` }], ms)]);
  const ftete = (deg: number, ms: number, dx = 0, dy = 0) => A(".p-ftete", [{ transform: `translate(${dx}%,${dy}%) rotate(${deg}deg)` }], ms);
  const aile = (deg: number, ms: number, dy = 0) => A(".p-aile", [{ transform: `translateY(${dy}%) rotate(${deg}deg)` }], ms);
  const queue = (deg: number, ms: number) => A(".p-queue", [{ transform: `rotate(${deg}deg)` }], ms);
  const cligne = (s = ".p-tete .paup") => A(s, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)", offset: .45 }, { transform: "scaleY(1)", offset: .55 }, { transform: "scaleY(0)" }], 260, { easing: "ease-in-out", fill: "none" });

  /* place sur la branche : x en % de la largeur ; la branche ondule, les pattes la suivent */
  let x = 0, gauche = false, face = false;
  const sol = (v: number) => v < 0 ? -v * .12 : -v * .05;
  const pos = (nx: number, ms: number, saut = 0) => {
    const images: Keyframe[] = [{ transform: `translate(${x}%,${sol(x)}%)` }];
    if (saut) images.push({ transform: `translate(${(x + nx) / 2}%,${sol((x + nx) / 2) - saut}%)` });
    images.push({ transform: `translate(${nx}%,${sol(nx)}%)` });
    x = nx;
    if (saut) A(".c-ombre", [{ opacity: 1 }, { opacity: 0, offset: .3 }, { opacity: 0, offset: .7 }, { opacity: 1 }], ms, { fill: "none" });
    return A(".c-pos", images, ms);
  };
  const retourne = async (nx: number) => {
    const p = pos(nx, 540, 7);
    await dors(200);
    gauche = !gauche;
    A(".c-sens", [{ transform: `scaleX(${gauche ? -1 : 1})` }], 160, { easing: "ease-in-out" });
    await p;
  };
  const tourne = async (versVous: boolean) => {
    await corps([{ transform: "scale(1,1)" }, { transform: "scale(1.05,.93)" }], 140);
    vis(versVous ? ".c-face" : ".c-profil", 1); vis(versVous ? ".c-profil" : ".c-face", 0);
    face = versVous;
    await pos(x, 380, 5);
    await corps([{ transform: "scale(1.04,.95)" }, { transform: "scale(1,1)" }], 180);
  };
  const zzz = () => {
    const z = $(".c-zz"), t = b.offsetWidth;
    [0, 1, 2].forEach(k => {
      const e = document.createElement("span");
      e.textContent = "Z";
      z.append(e);
      e.animate([{ opacity: 0, transform: "translate(0,0) scale(.5)" }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 },
        { opacity: 0, transform: `translate(${t * (.08 + k * .03)}px,-${t * (.22 + k * .05)}px) scale(${1 + k * .3})` }],
        { duration: 2600, delay: k * 700, easing: "ease-out", fill: "forwards" }).finished.then(() => e.remove(), () => e.remove());
    });
  };

  const GESTES: Record<string, () => Promise<unknown>> = {
    penche: async () => { await tete(-12, 700, 0, -1); await dors(900); await tete(-5, 350); await tete(-13, 350); await dors(500); await tete(0, 600); },
    bas: async () => { await tete(14, 650, 1, 2); await dors(1400); cligne(); await dors(500); await tete(0, 600); },
    haut: async () => { await tete(-14, 700, 0, -2.5); await dors(1200); await tete(0, 600); },
    queue: async () => { for (let k = 0; k < 3; k++) { await queue(-7, 130); await queue(4, 130); } await queue(0, 250); },
    pas: async () => {
      const but = x === 0 ? (Math.random() < .5 ? -12 : 8) : 0, mi = (x + but) / 2;
      await Promise.all([pos(mi, 420, 2.5), corps([{ transform: "rotate(0)" }, { transform: "rotate(-3deg)" }, { transform: "rotate(0)" }], 420)]);
      await Promise.all([pos(but, 420, 2.5), corps([{ transform: "rotate(0)" }, { transform: "rotate(3deg)" }, { transform: "rotate(0)" }], 420)]);
    },
    ebouriffe: async () => { await Promise.all([aile(-9, 450, -2), corps([{ transform: "scale(1,1)" }, { transform: "scale(1.03,1.02)" }, { transform: "scale(1,1)" }], 900)]); await dors(300); await aile(0, 500); },
    ebroue: async () => {
      const t: Keyframe[] = [0, 1, 2, 3, 4, 5, 6].map(k => ({ transform: `rotate(${k % 2 ? 4 : -4}deg) translateX(${k % 2 ? 1.2 : -1.2}%)` }));
      t.push({ transform: "none" });
      await Promise.all([corps(t, 800), A(".p-tete,.p-cou,.p-nuque", [{ transform: "rotate(6deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(4deg)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(0)" }], 800), queue(6, 400).then(() => queue(0, 400))]);
    },
    retourne: () => retourne(x),
    lisse: async () => { await tete(24, 700, -2, 4); for (let k = 0; k < 3; k++) { await tete(20, 180, -2, 4); await tete(27, 180, -2, 4.5); } await aile(-4, 250); await aile(0, 250); await tete(0, 650); },
    saut: async () => {
      await corps([{ transform: "scale(1,1)" }, { transform: "scale(1.04,.95)" }, { transform: "scale(1,1)" }], 220);
      await pos(x, 480, 9);
      await corps([{ transform: "scale(1,1)" }, { transform: "scale(1.04,.95)" }, { transform: "scale(1,1)" }], 220);
    },
    etire: async () => {
      const replie: Keyframe = { transform: "rotate(55deg) scale(.45,.6)", opacity: 0 };
      await A(".p-aile-ouverte,.p-aile-loin", [replie], 1);
      await Promise.all([A(".p-aile-ouverte,.p-aile-loin", [{ transform: "rotate(0) scale(1,1)", opacity: 1 }], 800), vis(".p-aile", 0, 350), tete(-6, 800)]);
      await A(".p-aile-ouverte", [{ transform: "rotate(-4deg) scale(1.03,1.03)" }], 450);
      await A(".p-aile-ouverte", [{ transform: "rotate(0) scale(1,1)" }], 450);
      await Promise.all([A(".p-aile-ouverte,.p-aile-loin", [replie], 700), vis(".p-aile", 1, 450), tete(0, 650)]);
    },
    croasse: async () => {
      for (let k = 0; k < 2; k++) {
        await tete(-10, 180, 0, -1);
        vis(".c-tete-cri", 1); vis(".p-tete > .c-tete", 0);
        await corps([{ transform: "scale(1,1)" }, { transform: "scale(1.03,1.02)" }, { transform: "scale(1,1)" }], 380);
        vis(".c-tete-cri", 0); vis(".p-tete > .c-tete", 1);
        await tete(0, 220); await dors(150);
      }
    },
    face: async () => {
      await tourne(true); await dors(700);
      const cl = () => cligne(".c-face .paup");
      cl(); await dors(600);
      await ftete(-11, 550, 0, -.5); await dors(700); await ftete(9, 650, 0, -.5); await dors(700); await ftete(0, 450);
      await ftete(0, 200, -2.5, 0); await dors(600); await ftete(0, 350, 2.5, 0); await dors(600); await ftete(0, 300);
      for (let k = 0; k < 2; k++) { await ftete(0, 180, 0, 2); await ftete(0, 180); }
      cl(); await dors(800); await tourne(false);
    },
    somnole: async () => {
      vis(".c-tete-dort", 1, 400); await vis(".p-tete > .c-tete", 0, 400);
      await tete(9, 1600, 0, 1.5); zzz(); await dors(3600);
      await tete(0, 700); vis(".c-tete-dort", 0, 300); await vis(".p-tete > .c-tete", 1, 300);
    }
  };
  const SEUL = Object.keys(GESTES).filter(g => g !== "somnole");
  const TOUCHE = ["croasse", "etire", "saut"];
  const CLASSE: Record<string, string> = { croasse: "croasse", etire: "ailes", saut: "saute" };

  let occupe = false, dernier = "", n = 0, enAttente: string | null = null;
  const jouer = async (g: string) => {
    occupe = true; dernier = g;
    const c = CLASSE[g];
    if (c) b.classList.add(c);
    try {
      if (face && g !== "face") await tourne(false);
      if (x !== 0 && g !== "pas" && Math.random() < .5) await GESTES.pas();
      await GESTES[g]();
    } finally {
      if (c) b.classList.remove(c);
      occupe = false;
    }
    if (enAttente) { const s = enAttente; enAttente = null; jouer(s); }
  };
  b.onclick = () => {
    const g = TOUCHE[n++ % TOUCHE.length];
    if (occupe) enAttente = g; else jouer(g);
  };

  /* en développement seulement : faire jouer un geste à la demande (démonstrations, captures) */
  if (import.meta.env.DEV) (window as unknown as { __MUNINN_CORBEAU__: (g: string) => Promise<void> }).__MUNINN_CORBEAU__ = jouer;

  if (calme.matches) return;
  /* il respire, la queue bouge à peine, il cligne des yeux */
  $(".c-groupe").animate([{ transform: "scale(1,1)" }, { transform: "scale(1.006,1.016)" }, { transform: "scale(1,1)" }], { duration: 3800, iterations: Infinity, easing: "ease-in-out" });
  (async () => { for (;;) { await dors(2200 + Math.random() * 3000); if (!document.hidden && !occupe) cligne(); } })();
  /* un geste tout seul toutes les 8 à 20 secondes, sauf si l'appli n'est pas à l'écran ; jamais deux fois le même */
  const suivant = () => setTimeout(() => {
    if (!calme.matches && !document.hidden && !occupe) {
      const soir = new Date().getHours() >= SOIR;
      let g = soir && dernier !== "somnole" && Math.random() < .35 ? "somnole" : SEUL[Math.floor(Math.random() * SEUL.length)];
      if (g === dernier) g = SEUL[(SEUL.indexOf(g) + 1) % SEUL.length];
      jouer(g);
    }
    suivant();
  }, 8000 + Math.random() * 12000);
  suivant();
}
