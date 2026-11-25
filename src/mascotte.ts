/* Muninn, le petit corbeau : emblème et mascotte de l'appli, toute l'année, sur son perchoir
   (à côté du titre, ou dans la marge de gauche quand l'écran est large). Il porte de petites lunettes rondes
   et le chapeau de saison. Il ne quitte jamais son perchoir (plus de tour en vol, choix de Corentin).
   Il vit tout seul, sans qu'on le touche (choix de Corentin du 25 novembre 2026) : il respire, cligne des yeux,
   et toutes les 3 à 9 secondes fait un petit geste tiré au hasard, jamais deux fois le même de suite :
   fermer les yeux un moment, regarder à gauche, à droite, autour, en haut, en bas, pencher la tête d'un côté ou
   de l'autre, s'ébrouer (ses lunettes ou son chapeau peuvent alors se mettre de travers, et il les remet en place
   peu après), sautiller, faire un pas sur le perchoir, remuer la queue, s'étirer, battre des ailes, croasser.
   Le soir (à partir de 20 h) et parfois dans la journée, il s'endort un moment : yeux fermés, tête qui tombe,
   lunettes qui glissent, « Z » qui s'envolent. Touché, il se réveille, puis croasse, bat des ailes ou sautille.
   Tout est animé par Web Animations sur des groupes du dessin ; couleurs dans styles.css. */

const PERCHOIR = `<svg class="perchoir" viewBox="0 0 100 118" aria-hidden="true">
  <path d="M47 95h6v17h-6z" class="p-bois-fonce"/>
  <ellipse cx="50" cy="113" rx="20" ry="4.5" class="p-bois-fonce"/>
  <rect x="6" y="90" width="88" height="7" rx="3.5" class="p-bois"/>
  <path d="M86 90q6-9 13-8q-3 8-13 8z" class="p-feuille"/>
</svg>`;

const CHAPEAUX = `
        <g class="chapeau h-sorciere"><path d="M14 13q18-6 36 0l-3 3q-15-4-30 0z" fill="#3B2A4A"/><path d="M21 13q4-15 18-22-2 9 4 21q-11-2-22 1z" fill="#3B2A4A"/><path d="M21.5 11.5q10-2.5 21-.5l-.4 3q-10-2-20 .3z" fill="var(--accent)"/></g>
        <g class="chapeau h-bonnet"><path d="M14 14q4-14 20-16q12 0 16 14z" fill="#D32F2F"/><path d="M34-2q12-2 16 10" fill="none" stroke="#D32F2F" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="13" r="4.5" fill="#FFFFFF"/><rect x="12" y="11" width="40" height="7" rx="3.5" fill="#FFFFFF"/></g>
        <g class="chapeau h-oreilles"><ellipse cx="24" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(-12 24 -2)"/><ellipse cx="40" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(12 40 -2)"/><ellipse cx="24" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(-12 24 -1)"/><ellipse cx="40" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(12 40 -1)"/></g>
        <g class="chapeau h-fete"><path d="M24 11l9-21 9 21z" fill="var(--accent)"/><path d="M27 4l12 0M25.5 8l15 0M29 0l8 0" stroke="#F7C948" stroke-width="2"/><circle cx="33" cy="-11" r="3.2" fill="#F7C948"/></g>`;

const CORBEAU = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g class="c-pos">
    <path d="M40 85v7M60 85v7M36 93l4-2 4 2M56 93l4-2 4 2" class="c-patte"/>
    <g class="c-corps"><g class="c-souffle">
      <path d="M24 74 L6 80 L9 84 L5 88 L12 89 L11 93 L27 84z" class="c-plume c-queue"/>
      <path d="M18 46 Q8 62 14 82 Q24 80 28 66z" class="c-plume c-aile g"/>
      <path d="M82 46 Q92 62 86 82 Q76 80 72 66z" class="c-plume c-aile d"/>
      <g class="c-tete">
        <path d="M50 15C72 15 86 32 85 54C84 76 70 88 50 88C30 88 16 76 15 54C14 32 28 15 50 15Z" class="c-corps-plume"/>
        <path d="M42 18q-1-10 6-6q2-9 8-2q5-4 5 4q-9-2-19 4z" class="c-corps-plume c-houppe"/>
        <path d="M30 70Q50 58 70 70Q66 86 50 87Q34 86 30 70z" class="c-ventre"/>
        <path d="M36 72q4 3 8 0M46 70q4 3 8 0M56 72q4 3 8 0M41 78q4 3 8 0M51 78q4 3 8 0" class="c-ecaille"/>
        <g class="c-visage">
          <ellipse cx="25" cy="58" rx="5.5" ry="3.2" class="c-joue"/><ellipse cx="75" cy="58" rx="5.5" ry="3.2" class="c-joue"/>
          <g class="c-yeux">
            <circle cx="35" cy="44" r="11.5" fill="#F3DDBF"/><circle cx="65" cy="44" r="11.5" fill="#F3DDBF"/>
            <g class="c-pupilles">
              <circle cx="36.5" cy="45.5" r="8.6" fill="#141018"/><circle cx="63.5" cy="45.5" r="8.6" fill="#141018"/>
              <circle cx="33.5" cy="42" r="3.2" fill="#fff"/><circle cx="39.5" cy="49" r="1.3" fill="#fff"/>
              <circle cx="60.5" cy="42" r="3.2" fill="#fff"/><circle cx="66.5" cy="49" r="1.3" fill="#fff"/>
            </g>
          </g>
          <path d="M26 45q9 5.5 18 0M56 45q9 5.5 18 0" class="c-ferme"/>
          <path d="M43 51Q50 47 57 51Q55 58 50 62Q45 58 43 51z" class="c-bec-haut"/>
          <path d="M44.5 55Q50 57 55.5 55Q53.5 59.5 50 62Q46.5 59.5 44.5 55z" class="c-bec-bas"/>
          <g class="c-lunettes">
            <circle cx="35" cy="44" r="13.6" class="l-verre"/><circle cx="65" cy="44" r="13.6" class="l-verre"/>
            <path d="M27 37.5q3-3.5 7-4.3M57 37.5q3-3.5 7-4.3" class="l-reflet"/>
            <circle cx="35" cy="44" r="13.6" class="l-monture"/><circle cx="65" cy="44" r="13.6" class="l-monture"/>
            <path d="M48.5 42.5q1.5-2.4 3 0M21.4 42.6L15.6 39.6M78.6 42.6L84.4 39.6" class="l-monture"/>
          </g>
        </g>
        <g class="c-chapeau"><g transform="translate(50 24) scale(1.25) translate(-32 -13)">${CHAPEAUX}
        </g></g>
      </g>
    </g></g>
  </g></svg><span class="c-zz" aria-hidden="true"></span><span class="c-bulle" aria-hidden="true">Croâ !</span>`;

const SOIR = 20;   // comme « Ma journée » : à partir de 20 h, la journée est finie
const DOUX = "cubic-bezier(.45,0,.25,1)";
const dors = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const hasard = (a: number, b: number) => a + Math.random() * (b - a);
const pile = () => Math.random() < .5;

export function installer(place: HTMLElement) {
  const duo = document.createElement("div");
  duo.className = "compagnon";
  duo.innerHTML = PERCHOIR + `<button type="button" class="corbeau" aria-label="Muninn, le petit corbeau (touchez-le)">${CORBEAU}</button>`;
  place.replaceWith(duo);
  const b = duo.querySelector<HTMLElement>(".corbeau")!;
  const el = (s: string) => b.querySelector<SVGElement | HTMLElement>(s)!;
  const calme = matchMedia("(prefers-reduced-motion: reduce)");

  /* Chaque geste porte un numéro : toucher le corbeau en commence un autre, et l'ancien s'arrête à sa prochaine étape. */
  let tour = 0;
  class Coupe extends Error {}
  const suite = (t: number) => { if (t !== tour) throw new Coupe(); };
  /* anime une pièce vers une pose et la garde (la pose de départ est celle du moment) */
  const A = (s: string, images: Keyframe[], ms: number, o: KeyframeAnimationOptions = {}) => {
    const a = el(s).animate(images, { duration: ms, easing: DOUX, fill: "forwards", ...o });
    return a.finished.then(() => {
      if (o.fill !== "none") { try { a.commitStyles(); } catch { /* pièce cachée */ } a.cancel(); }
    }, () => undefined);
  };
  const pose = (s: string, t: string, ms: number) => A(s, [{ transform: t }], ms);
  const montre = (s: string, o: number, ms = 120) => A(s, [{ opacity: o }], ms, { easing: "linear" });

  /* ce qui dure d'un geste à l'autre */
  let x = 0, endormi = false, lunettesDeTravers = false, chapeauDeTravers = false, dernier = "";
  const chapeauVisible = () => [...b.querySelectorAll<SVGElement>(".chapeau")].some(c => getComputedStyle(c).display !== "none");

  const cligne = async (fois = 1) => {
    for (let k = 0; k < fois; k++) {
      await pose(".c-yeux", "scaleY(.08)", 70);
      await pose(".c-yeux", "scaleY(1)", 90);
      if (k < fois - 1) await dors(110);
    }
  };
  const fermeYeux = (ms: number) => Promise.all([pose(".c-yeux", "scaleY(.06)", ms), montre(".c-ferme", 1, ms)]);
  const ouvreYeux = (ms: number) => Promise.all([pose(".c-yeux", "scaleY(1)", ms), montre(".c-ferme", 0, ms)]);
  const regard = (dx: number, dy: number, ms: number) => Promise.all([
    pose(".c-visage", `translate(${dx * 1.6}px,${dy * 1.2}px)`, ms),
    pose(".c-pupilles", `translate(${dx}px,${dy}px)`, ms),
    pose(".c-houppe", `translate(${dx * .6}px,0px)`, ms)]);
  const tete = (deg: number, ms: number) => pose(".c-tete", `rotate(${deg}deg)`, ms);
  const corps = (images: Keyframe[], ms: number) => A(".c-corps", images, ms, { fill: "none" });
  const vaEn = (nx: number, ms: number, haut = 0) => {
    const f: Keyframe[] = [{ transform: `translate(${x}px,0px)` }];
    if (haut) f.push({ transform: `translate(${(x + nx) / 2}px,${-haut}px)` });
    f.push({ transform: `translate(${nx}px,0px)` });
    x = nx;
    return A(".c-pos", f, ms);
  };
  /* les « Z » montent tant qu'il dort */
  const zzz = (t: number) => {
    const z = el(".c-zz");
    (async () => {
      for (let k = 0; endormi && t === tour; k++) {
        const e = document.createElement("span");
        e.textContent = "Z";
        z.append(e);
        const w = b.offsetWidth;
        e.animate([{ opacity: 0, transform: "translate(0,0) scale(.5)" }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 },
          { opacity: 0, transform: `translate(${w * (.1 + (k % 3) * .04)}px,-${w * (.18 + (k % 3) * .05)}px) scale(${1 + (k % 3) * .3})` }],
          { duration: 2600, easing: "ease-out", fill: "forwards" }).finished.then(() => e.remove(), () => e.remove());
        await dors(850);
      }
    })();
  };

  const GESTES: Record<string, (t: number) => Promise<unknown>> = {
    yeux: async t => { await fermeYeux(160); suite(t); await dors(hasard(900, 2200)); suite(t); await ouvreYeux(220); cligne(); },
    gauche: async t => { await regard(-3, 0, 380); suite(t); await dors(hasard(800, 1800)); suite(t); await regard(0, 0, 380); },
    droite: async t => { await regard(3, 0, 380); suite(t); await dors(hasard(800, 1800)); suite(t); await regard(0, 0, 380); },
    autour: async t => {
      await regard(-3, 0, 350); suite(t); await dors(700); suite(t);
      await regard(3, -.5, 500); suite(t); await dors(700); suite(t); cligne();
      await regard(0, 0, 350);
    },
    haut: async t => {
      await Promise.all([regard(0, -2.5, 450), tete(pile() ? -4 : 4, 450)]); suite(t);
      await dors(hasard(900, 1600)); suite(t);
      await Promise.all([regard(0, 0, 400), tete(0, 400)]);
    },
    bas: async t => { await regard(0, 2.5, 450); suite(t); await dors(hasard(900, 1600)); suite(t); cligne(); await regard(0, 0, 400); },
    penche: async t => {
      const s = pile() ? 1 : -1;
      await Promise.all([tete(13 * s, 500), A(".c-chapeau", [{ transform: `rotate(${-5 * s}deg)` }], 650)]); suite(t);
      await dors(hasard(700, 1500)); suite(t);
      if (pile()) { await tete(-9 * s, 650); suite(t); await dors(hasard(600, 1200)); suite(t); }
      await Promise.all([tete(0, 450), chapeauDeTravers ? Promise.resolve() : pose(".c-chapeau", "rotate(0deg)", 600)]);
    },
    ebroue: async t => {
      const secousse: Keyframe[] = [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ transform: `rotate(${k % 2 ? 6 : -6}deg)` }));
      secousse.push({ transform: "rotate(0deg)" });
      await Promise.all([
        corps(secousse, 760),
        A(".c-tete", [{ transform: "rotate(0deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-6deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(0deg)" }], 760),
        A(".c-aile.g", [{ transform: "rotate(0deg)" }, { transform: "rotate(35deg)" }, { transform: "rotate(0deg)" }, { transform: "rotate(35deg)" }, { transform: "rotate(0deg)" }], 760),
        A(".c-aile.d", [{ transform: "rotate(0deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(0deg)" }, { transform: "rotate(-35deg)" }, { transform: "rotate(0deg)" }], 760),
        A(".c-houppe", [{ transform: "rotate(0deg)" }, { transform: "rotate(-15deg)" }, { transform: "rotate(12deg)" }, { transform: "rotate(0deg)" }], 760),
        A(".c-lunettes", [{ transform: "rotate(0deg)" }, { transform: "rotate(5deg)" }, { transform: "rotate(-5deg)" }, { transform: "rotate(0deg)" }], 760),
        A(".c-chapeau", [{ transform: "rotate(0deg)" }, { transform: "translate(0px,-3px) rotate(-9deg)" }, { transform: "translate(0px,-2px) rotate(8deg)" }, { transform: "rotate(0deg)" }], 760)
      ]);
      suite(t);
      /* parfois, les lunettes ou le chapeau ne retombent pas droit : il les remettra un peu plus tard */
      const l = Math.random() < .55, c = chapeauVisible() && Math.random() < .55;
      const tombe: Promise<unknown>[] = [];
      if (l) { lunettesDeTravers = true; tombe.push(pose(".c-lunettes", `translate(${pile() ? 1.5 : -1.5}px,2.5px) rotate(${pile() ? 9 : -9}deg)`, 260)); }
      if (c) { chapeauDeTravers = true; tombe.push(pose(".c-chapeau", `translate(${pile() ? 4 : -4}px,1px) rotate(${pile() ? 14 : -14}deg)`, 300)); }
      await Promise.all(tombe);
      if (l || c) await cligne(2);
    },
    remet: async t => {
      /* il lève l'aile, se redresse d'un petit coup de tête, et tout reprend sa place */
      await Promise.all([pose(".c-aile.d", "rotate(-55deg)", 300), tete(-5, 300)]); suite(t);
      await Promise.all([
        lunettesDeTravers ? pose(".c-lunettes", "translate(0px,0px) rotate(0deg)", 320) : Promise.resolve(),
        chapeauDeTravers ? pose(".c-chapeau", "translate(0px,0px) rotate(0deg)", 360) : Promise.resolve(),
        tete(3, 260)]);
      lunettesDeTravers = chapeauDeTravers = false;
      await Promise.all([pose(".c-aile.d", "rotate(0deg)", 320), tete(0, 300)]);
      await cligne();
    },
    sautille: async t => {
      for (let k = 0; k < (pile() ? 2 : 3); k++) {
        await corps([{ transform: "scale(1,1)" }, { transform: "translateY(2px) scale(1.06,.92)" }, { transform: "scale(1,1)" }], 160); suite(t);
        await vaEn(x, 300, 9); suite(t);
      }
    },
    pas: async t => {
      const but = x === 0 ? (pile() ? -7 : 7) : 0;
      await vaEn((x + but) / 2, 280, 2.5); suite(t);
      await vaEn(but, 280, 2.5); suite(t);
      await regard(Math.sign(but) * 2, 0, 300); suite(t);
      await dors(900); suite(t);
      await regard(0, 0, 300);
    },
    queue: async t => {
      for (let k = 0; k < 3; k++) { await pose(".c-queue", "rotate(-10deg)", 110); suite(t); await pose(".c-queue", "rotate(6deg)", 110); suite(t); }
      await pose(".c-queue", "rotate(0deg)", 200);
    },
    etire: async t => {
      await Promise.all([pose(".c-aile.g", "rotate(55deg)", 700), pose(".c-aile.d", "rotate(-55deg)", 700),
        pose(".c-souffle", "scale(1.04,1.08)", 700), fermeYeux(500), tete(-6, 700)]); suite(t);
      await dors(700); suite(t);
      await Promise.all([pose(".c-aile.g", "rotate(0deg)", 600), pose(".c-aile.d", "rotate(0deg)", 600),
        pose(".c-souffle", "scale(1,1)", 600), ouvreYeux(400), tete(0, 600)]);
      await cligne();
    },
    ailes: async t => {
      b.classList.add("ailes");
      try {
        await Promise.all([
          A(".c-aile.g", [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ transform: `rotate(${k % 2 ? 40 : 0}deg)` })), 1150),
          A(".c-aile.d", [0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => ({ transform: `rotate(${k % 2 ? -40 : 0}deg)` })), 1150),
          A(".c-pos", [{ transform: `translate(${x}px,0px)` }, { transform: `translate(${x}px,-14px)` }, { transform: `translate(${x}px,-14px)` }, { transform: `translate(${x}px,0px)` }], 1150)]);
        suite(t);
      } finally { b.classList.remove("ailes"); }
    },
    croasse: async t => {
      b.classList.add("croasse");
      try {
        for (let k = 0; k < 2; k++) {
          await Promise.all([pose(".c-bec-bas", "translateY(4px) scaleY(1.3)", 140), tete(-6, 140),
            corps([{ transform: "scale(1,1)" }, { transform: "translateY(-3px) scale(1.03,1.03)" }, { transform: "scale(1,1)" }], 300)]); suite(t);
          await Promise.all([pose(".c-bec-bas", "translateY(0px) scaleY(1)", 160), tete(0, 160)]); suite(t);
          await dors(160);
        }
        await dors(500);
      } finally { b.classList.remove("croasse"); }
    },
    dort: async t => {
      endormi = true;
      try {
        await fermeYeux(900); suite(t);
        await Promise.all([tete(pile() ? 8 : -8, 1400), pose(".c-lunettes", "translate(0px,3px)", 1400),
          pose(".c-souffle", "scale(1.02,.97)", 1400)]); suite(t);
        zzz(t);
        await dors(new Date().getHours() >= SOIR ? hasard(9000, 16000) : hasard(5000, 8000)); suite(t);
        await reveille();
      } finally { endormi = false; }
    }
  };
  async function reveille() {
    endormi = false;
    await Promise.all([ouvreYeux(220), tete(0, 300), pose(".c-souffle", "scale(1,1)", 300),
      lunettesDeTravers ? Promise.resolve() : pose(".c-lunettes", "translate(0px,0px) rotate(0deg)", 400)]);
    await cligne(2);
  }

  /* un geste à la fois ; toucher le corbeau interrompt le geste en cours */
  let occupe = false;
  const jouer = async (g: string) => {
    const t = ++tour;
    occupe = true; dernier = g;
    try {
      if (endormi && g !== "dort") await reveille();
      await GESTES[g](t);
    } catch (e) {
      if (!(e instanceof Coupe)) throw e;
    } finally {
      if (t === tour) occupe = false;
    }
  };
  const TOUCHE = ["croasse", "ailes", "sautille"];
  let n = 0;
  b.onclick = () => {
    const g = TOUCHE[n++ % TOUCHE.length];
    b.classList.remove("croasse", "ailes");
    jouer(g);
  };

  /* en développement seulement : faire jouer un geste à la demande (démonstrations, captures) */
  if (import.meta.env.DEV) (window as unknown as { __MUNINN_CORBEAU__: (g: string) => Promise<void> }).__MUNINN_CORBEAU__ = jouer;

  if (calme.matches) return;
  /* il respire, et cligne des yeux de temps en temps (parfois deux fois) */
  el(".c-souffle").animate([{ transform: "scale(1,1)" }, { transform: "scale(1.025,.975)" }, { transform: "scale(1,1)" }],
    { duration: 3400, iterations: Infinity, easing: "ease-in-out", composite: "add" });
  (async () => { for (;;) { await dors(hasard(2500, 6000)); if (!document.hidden && !endormi && !occupe) cligne(Math.random() < .2 ? 2 : 1); } })();

  /* un petit geste tout seul toutes les 3 à 9 secondes, jamais deux fois le même de suite */
  const AU_HASARD: [string, number][] = [["yeux", 2], ["gauche", 2], ["droite", 2], ["autour", 2], ["haut", 1], ["bas", 1],
    ["penche", 3], ["ebroue", 2], ["sautille", 1], ["pas", 2], ["queue", 1], ["etire", 1], ["ailes", .5], ["croasse", .5], ["dort", .4]];
  const tirer = () => {
    if ((lunettesDeTravers || chapeauDeTravers) && Math.random() < .8) return "remet";
    if (new Date().getHours() >= SOIR && dernier !== "dort" && Math.random() < .35) return "dort";
    const choix = AU_HASARD.filter(([g]) => g !== dernier);
    let r = Math.random() * choix.reduce((s, [, p]) => s + p, 0);
    for (const [g, p] of choix) if ((r -= p) <= 0) return g;
    return choix[0][0];
  };
  const suivant = () => setTimeout(() => {
    if (!calme.matches && !document.hidden && !occupe) jouer(tirer());
    suivant();
  }, hasard(3000, 9000));
  suivant();
}
