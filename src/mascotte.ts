/* Mascotte : Muninn, le petit corbeau de l'appli, à côté du titre, toute l'année (chapeau de saison compris).
   Au repos il respire et cligne des yeux ; de temps en temps il fait quelque chose tout seul
   (penche la tête, regarde derrière lui, sautille, s'ébroue, part faire un tour et revient).
   Quand on le touche, il réagit : croasse, saute, bat des ailes. */

const SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <g class="m-vol"><g class="m-sens"><g class="m-corps">
    <path d="M17 44 L3 55 L5 58.5 L9 57 L21 50z" class="m-plume"/>
    <path d="M27 52v6M33 52v6M24.5 58h5M30.5 58h5" class="m-patte"/>
    <ellipse cx="28" cy="40" rx="16" ry="13.5" class="m-plume"/>
    <path d="M19 38q8-6 18 1q-2 9-12 11q-7 1-12 5q1-11 6-17z" class="m-aile"/>
    <g class="m-tete">
      <circle cx="38" cy="23" r="11.5" class="m-plume"/>
      <path d="M33 33q6 4 12-1.5" class="m-echarpe"/>
      <g class="m-bec"><path d="M47.5 18.5 L61 22.5 L47.5 24.8z" class="m-bec-haut"/><path d="M47.5 24.2 L59 23.3 L47.5 27.5z" class="m-bec-bas"/></g>
      <g class="m-oeil"><circle cx="42.5" cy="20" r="3.4" fill="#FFFFFF"/><circle cx="43.3" cy="20" r="2" fill="#141C1B"/><circle cx="44" cy="19.2" r=".7" fill="#FFFFFF"/></g>
      <g transform="translate(38 13) scale(.6) translate(-32 -11)">
        <g class="chapeau h-sorciere"><path d="M14 13q18-6 36 0l-3 3q-15-4-30 0z" fill="#3B2A4A"/><path d="M21 13q4-15 18-22-2 9 4 21q-11-2-22 1z" fill="#3B2A4A"/><path d="M21.5 11.5q10-2.5 21-.5l-.4 3q-10-2-20 .3z" fill="var(--accent)"/></g>
        <g class="chapeau h-bonnet"><path d="M14 14q4-14 20-16q12 0 16 14z" fill="#D32F2F"/><path d="M34-2q12-2 16 10" fill="none" stroke="#D32F2F" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="13" r="4.5" fill="#FFFFFF"/><rect x="12" y="11" width="40" height="7" rx="3.5" fill="#FFFFFF"/></g>
        <g class="chapeau h-oreilles"><ellipse cx="24" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(-12 24 -2)"/><ellipse cx="40" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(12 40 -2)"/><ellipse cx="24" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(-12 24 -1)"/><ellipse cx="40" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(12 40 -1)"/></g>
        <g class="chapeau h-fete"><path d="M24 11l9-21 9 21z" fill="var(--accent)"/><path d="M27 4l12 0M25.5 8l15 0M29 0l8 0" stroke="#F7C948" stroke-width="2"/><circle cx="33" cy="-11" r="3.2" fill="#F7C948"/></g>
      </g>
    </g>
  </g></g></g></svg><span class="m-bulle" aria-hidden="true">Croâ !</span>`;

const REACTIONS = ["croasse", "saute", "ailes"];
const SEUL = ["penche", "regarde", "sautille", "ebroue", "vol"];
const DUREE: Record<string, number> = { croasse: 1600, saute: 1800, ailes: 1500, penche: 2200, regarde: 2400, sautille: 1600, ebroue: 1200, vol: 5200 };
const TOUTES = [...REACTIONS, ...SEUL];

export function installer(place: HTMLElement) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mascotte";
  b.setAttribute("aria-label", "Muninn, le petit corbeau (touchez-le)");
  b.innerHTML = SVG;
  place.replaceWith(b);
  let n = 0, minuterie: ReturnType<typeof setTimeout> | undefined, occupe = false;
  const jouer = (geste: string) => {
    clearTimeout(minuterie);
    b.classList.remove(...TOUTES);
    void b.offsetWidth;   // relance l'animation même si on tape plusieurs fois de suite
    b.classList.add(geste); occupe = true;
    minuterie = setTimeout(() => { b.classList.remove(...TOUTES); occupe = false; }, DUREE[geste]);
  };
  b.onclick = () => jouer(REACTIONS[n++ % REACTIONS.length]);

  /* de temps en temps, un geste tout seul (toutes les 20 à 50 secondes), sauf si les animations sont réduites
     ou que l'appli n'est pas à l'écran ; le tour en vol reste rare */
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const suivant = () => setTimeout(() => {
    if (!calme.matches && !document.hidden && !occupe) {
      const r = Math.random();
      jouer(r < .12 ? "vol" : SEUL[Math.floor(Math.random() * (SEUL.length - 1))]);
    }
    suivant();
  }, 20000 + Math.random() * 30000);
  suivant();
}
