/* Muninn, le petit corbeau : emblème et mascotte de l'appli, toute l'année, sur son perchoir
   (à côté du titre, ou dans la marge de gauche quand l'écran est large). Il porte le chapeau de saison.
   Au repos il respire, cligne des yeux ; de temps en temps il fait quelque chose tout seul (penche la tête,
   regarde autour de lui, s'ébroue, sautille, croasse) et parfois s'envole faire un tour dans l'appli
   avant de revenir sur son perchoir. Touché, il croasse, bat des ailes ou s'envole. */

const PERCHOIR = `<svg class="perchoir" viewBox="0 0 100 118" aria-hidden="true">
  <path d="M47 95h6v17h-6z" class="p-bois-fonce"/>
  <ellipse cx="50" cy="113" rx="20" ry="4.5" class="p-bois-fonce"/>
  <rect x="6" y="90" width="88" height="7" rx="3.5" class="p-bois"/>
  <path d="M86 90q6-9 13-8q-3 8-13 8z" class="p-feuille"/>
</svg>`;

const CORBEAU = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g class="c-vol"><g class="c-corps">
    <path d="M24 74 L6 80 L9 84 L5 88 L12 89 L11 93 L27 84z" class="c-plume"/>
    <path d="M18 46 Q8 62 14 82 Q24 80 28 66z" class="c-plume c-aile g"/>
    <path d="M82 46 Q92 62 86 82 Q76 80 72 66z" class="c-plume c-aile d"/>
    <path d="M40 85v7M60 85v7M36 93l4-2 4 2M56 93l4-2 4 2" class="c-patte"/>
    <g class="c-tete">
      <path d="M50 15C72 15 86 32 85 54C84 76 70 88 50 88C30 88 16 76 15 54C14 32 28 15 50 15Z" class="c-corps-plume"/>
      <path d="M42 18q-1-10 6-6q2-9 8-2q5-4 5 4q-9-2-19 4z" class="c-corps-plume"/>
      <path d="M30 70Q50 58 70 70Q66 86 50 87Q34 86 30 70z" class="c-ventre"/>
      <path d="M36 72q4 3 8 0M46 70q4 3 8 0M56 72q4 3 8 0M41 78q4 3 8 0M51 78q4 3 8 0" class="c-ecaille"/>
      <ellipse cx="25" cy="58" rx="5.5" ry="3.2" class="c-joue"/><ellipse cx="75" cy="58" rx="5.5" ry="3.2" class="c-joue"/>
      <g class="c-yeux">
        <circle cx="35" cy="44" r="11.5" fill="#F3DDBF"/><circle cx="65" cy="44" r="11.5" fill="#F3DDBF"/>
        <g class="c-pupilles">
          <circle cx="36.5" cy="45.5" r="8.6" fill="#141018"/><circle cx="63.5" cy="45.5" r="8.6" fill="#141018"/>
          <circle cx="33.5" cy="42" r="3.2" fill="#fff"/><circle cx="39.5" cy="49" r="1.3" fill="#fff"/>
          <circle cx="60.5" cy="42" r="3.2" fill="#fff"/><circle cx="66.5" cy="49" r="1.3" fill="#fff"/>
        </g>
      </g>
      <path d="M43 51Q50 47 57 51Q55 58 50 62Q45 58 43 51z" class="c-bec-haut"/>
      <path d="M44.5 55Q50 57 55.5 55Q53.5 59.5 50 62Q46.5 59.5 44.5 55z" class="c-bec-bas"/>
      <g transform="translate(50 24) scale(1.25) translate(-32 -13)">
        <g class="chapeau h-sorciere"><path d="M14 13q18-6 36 0l-3 3q-15-4-30 0z" fill="#3B2A4A"/><path d="M21 13q4-15 18-22-2 9 4 21q-11-2-22 1z" fill="#3B2A4A"/><path d="M21.5 11.5q10-2.5 21-.5l-.4 3q-10-2-20 .3z" fill="var(--accent)"/></g>
        <g class="chapeau h-bonnet"><path d="M14 14q4-14 20-16q12 0 16 14z" fill="#D32F2F"/><path d="M34-2q12-2 16 10" fill="none" stroke="#D32F2F" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="13" r="4.5" fill="#FFFFFF"/><rect x="12" y="11" width="40" height="7" rx="3.5" fill="#FFFFFF"/></g>
        <g class="chapeau h-oreilles"><ellipse cx="24" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(-12 24 -2)"/><ellipse cx="40" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(12 40 -2)"/><ellipse cx="24" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(-12 24 -1)"/><ellipse cx="40" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(12 40 -1)"/></g>
        <g class="chapeau h-fete"><path d="M24 11l9-21 9 21z" fill="var(--accent)"/><path d="M27 4l12 0M25.5 8l15 0M29 0l8 0" stroke="#F7C948" stroke-width="2"/><circle cx="33" cy="-11" r="3.2" fill="#F7C948"/></g>
      </g>
    </g>
  </g></g></svg><span class="c-bulle" aria-hidden="true">Croâ !</span>`;

const TOUCHE = ["croasse", "ailes", "vol"];
const SEUL = ["penche", "regarde", "ebroue", "sautille", "croasse"];
const DUREE: Record<string, number> = { croasse: 1600, ailes: 1400, vol: 7000, penche: 2200, regarde: 2600, ebroue: 1100, sautille: 1500 };
const TOUS = [...TOUCHE, ...SEUL];

export function installer(place: HTMLElement) {
  const duo = document.createElement("div");
  duo.className = "compagnon";
  duo.innerHTML = PERCHOIR + `<button type="button" class="corbeau" aria-label="Muninn, le petit corbeau (touchez-le)">${CORBEAU}</button>`;
  place.replaceWith(duo);
  const b = duo.querySelector<HTMLElement>(".corbeau")!;
  let n = 0, fin: ReturnType<typeof setTimeout> | undefined, occupe = false;
  const jouer = (g: string) => {
    clearTimeout(fin);
    b.classList.remove(...TOUS);
    void b.offsetWidth;   // relance l'animation même si on tape plusieurs fois de suite
    b.classList.add(g); occupe = true;
    fin = setTimeout(() => { b.classList.remove(...TOUS); occupe = false; }, DUREE[g]);
  };
  b.onclick = () => jouer(TOUCHE[n++ % TOUCHE.length]);

  /* de temps en temps, un geste tout seul (toutes les 20 à 50 secondes), sauf si les animations sont réduites
     ou que l'appli n'est pas à l'écran ; le tour en vol reste rare */
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const suivant = () => setTimeout(() => {
    if (!calme.matches && !document.hidden && !occupe)
      jouer(Math.random() < .15 ? "vol" : SEUL[Math.floor(Math.random() * SEUL.length)]);
    suivant();
  }, 20000 + Math.random() * 30000);
  suivant();
}
