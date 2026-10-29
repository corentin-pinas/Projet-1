/* Compagnons : le petit kiné à lunettes (pas un docteur) et, sur son épaule, Muninn, le petit corbeau, emblème de l'appli.
   Toute l'année ; le kiné porte le chapeau de saison. À côté du titre, ou dans la marge de gauche quand l'écran est large.
   Le kiné flotte et cligne des yeux ; touché, il rit, saute ou s'étire (le corbeau sursaute avec lui).
   Le corbeau cligne des yeux ; de temps en temps il fait quelque chose tout seul (penche la tête, regarde ailleurs,
   s'ébroue, sautille, part faire un tour en vol et revient) ; touché, il croasse, bat des ailes ou s'envole. */

const KINE = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <g class="m-corps">
    <ellipse class="m-bras g" cx="9.5" cy="37" rx="3.6" ry="5.5"/><ellipse class="m-bras d" cx="54.5" cy="37" rx="3.6" ry="5.5"/>
    <ellipse cx="24" cy="57.5" rx="5.5" ry="3.2" class="m-pied"/><ellipse cx="40" cy="57.5" rx="5.5" ry="3.2" class="m-pied"/>
    <ellipse cx="32" cy="32" rx="23" ry="24.5" class="m-peau"/>
    <path d="M27 9.5q3-6 6-1.5q2-4 5 0" class="m-trait m-epi" stroke-width="2"/>
    <path d="M13 47q19 11 38 0" class="m-col"/>
    <circle cx="19" cy="38.5" r="3" class="m-joue"/><circle cx="45" cy="38.5" r="3" class="m-joue"/>
    <g class="m-normal">
      <g class="m-yeux"><circle cx="25" cy="29.5" r="2.1"/><circle cx="39" cy="29.5" r="2.1"/></g>
      <path d="M27 39.5q5 4.5 10 0" class="m-trait" stroke-width="2.4"/>
    </g>
    <g class="m-joie">
      <path d="M22 30.5q3-3.2 6 0M36 30.5q3-3.2 6 0" class="m-trait" stroke-width="2.2"/>
      <path d="M25.5 38.5q6.5 9 13 0z" class="m-bouche"/>
    </g>
    <g class="chapeau h-sorciere"><path d="M14 13q18-6 36 0l-3 3q-15-4-30 0z" fill="#3B2A4A"/><path d="M21 13q4-15 18-22-2 9 4 21q-11-2-22 1z" fill="#3B2A4A"/><path d="M21.5 11.5q10-2.5 21-.5l-.4 3q-10-2-20 .3z" fill="var(--accent)"/></g>
    <g class="chapeau h-bonnet"><path d="M14 14q4-14 20-16q12 0 16 14z" fill="#D32F2F"/><path d="M34-2q12-2 16 10" fill="none" stroke="#D32F2F" stroke-width="7" stroke-linecap="round"/><circle cx="52" cy="13" r="4.5" fill="#FFFFFF"/><rect x="12" y="11" width="40" height="7" rx="3.5" fill="#FFFFFF"/></g>
    <g class="chapeau h-oreilles"><ellipse cx="24" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(-12 24 -2)"/><ellipse cx="40" cy="-2" rx="5" ry="13" fill="#FFF3E4" transform="rotate(12 40 -2)"/><ellipse cx="24" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(-12 24 -1)"/><ellipse cx="40" cy="-1" rx="2.2" ry="9" fill="#F6B7C3" transform="rotate(12 40 -1)"/></g>
    <g class="chapeau h-fete"><path d="M24 11l9-21 9 21z" fill="var(--accent)"/><path d="M27 4l12 0M25.5 8l15 0M29 0l8 0" stroke="#F7C948" stroke-width="2"/><circle cx="33" cy="-11" r="3.2" fill="#F7C948"/></g>
    <g class="m-lunettes"><circle cx="25" cy="29.5" r="6.6"/><circle cx="39" cy="29.5" r="6.6"/><path d="M31.6 29q.4-1.6.8 0"/></g>
  </g></svg>`;

const CORBEAU = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <g class="c-vol"><g class="c-sens"><g class="c-corps">
    <path d="M24 74 L6 80 L9 84 L5 88 L12 89 L11 93 L27 84z" class="c-plume"/>
    <path d="M18 46 Q8 62 14 82 Q24 80 28 66z" class="c-plume c-aile g"/>
    <path d="M82 46 Q92 62 86 82 Q76 80 72 66z" class="c-plume c-aile d"/>
    <path d="M40 85v7M60 85v7M36 93l4-2 4 2M56 93l4-2 4 2" class="c-patte"/>
    <path d="M50 15C72 15 86 32 85 54C84 76 70 88 50 88C30 88 16 76 15 54C14 32 28 15 50 15Z" class="c-corps-plume"/>
    <path d="M42 18q-1-10 6-6q2-9 8-2q5-4 5 4q-9-2-19 4z" class="c-corps-plume"/>
    <path d="M30 70Q50 58 70 70Q66 86 50 87Q34 86 30 70z" class="c-ventre"/>
    <path d="M36 72q4 3 8 0M46 70q4 3 8 0M56 72q4 3 8 0M41 78q4 3 8 0M51 78q4 3 8 0" class="c-ecaille"/>
    <ellipse cx="25" cy="58" rx="5.5" ry="3.2" class="c-joue"/><ellipse cx="75" cy="58" rx="5.5" ry="3.2" class="c-joue"/>
    <g class="c-yeux">
      <circle cx="35" cy="44" r="11.5" fill="#F3DDBF"/><circle cx="65" cy="44" r="11.5" fill="#F3DDBF"/>
      <circle cx="36.5" cy="45.5" r="8.6" fill="#141018"/><circle cx="63.5" cy="45.5" r="8.6" fill="#141018"/>
      <circle cx="33.5" cy="42" r="3.2" fill="#fff"/><circle cx="39.5" cy="49" r="1.3" fill="#fff"/>
      <circle cx="60.5" cy="42" r="3.2" fill="#fff"/><circle cx="66.5" cy="49" r="1.3" fill="#fff"/>
    </g>
    <path d="M43 51Q50 47 57 51Q55 58 50 62Q45 58 43 51z" class="c-bec-haut"/>
    <path d="M44.5 55Q50 57 55.5 55Q53.5 59.5 50 62Q46.5 59.5 44.5 55z" class="c-bec-bas"/>
  </g></g></g></svg><span class="c-bulle" aria-hidden="true">Croâ !</span>`;

const GESTES_KINE = ["rit", "saute", "etire"];
const TOUCHE_CORBEAU = ["croasse", "ailes", "vol"];
const SEUL_CORBEAU = ["penche", "regarde", "ebroue", "sautille", "croasse"];
const DUREE: Record<string, number> = { rit: 1800, saute: 1800, etire: 1800, croasse: 1600, ailes: 1400, vol: 5200, penche: 2200, regarde: 2400, ebroue: 1100, sautille: 1500 };

/* lance un geste (classe CSS) sur un élément, le retire à la fin ; renvoie une fonction « occupé ? » */
function geste(el: HTMLElement, tous: string[]) {
  let fin: ReturnType<typeof setTimeout> | undefined, occupe = false;
  return {
    jouer(g: string) {
      clearTimeout(fin);
      el.classList.remove(...tous);
      void el.offsetWidth;   // relance l'animation même si on tape plusieurs fois de suite
      el.classList.add(g); occupe = true;
      fin = setTimeout(() => { el.classList.remove(...tous); occupe = false; }, DUREE[g]);
    },
    occupe: () => occupe
  };
}

export function installer(place: HTMLElement) {
  const duo = document.createElement("div");
  duo.className = "compagnon";
  duo.innerHTML = `<button type="button" class="mascotte" aria-label="Le petit kiné (touchez-le)">${KINE}</button>
    <button type="button" class="corbeau" aria-label="Muninn, le petit corbeau (touchez-le)">${CORBEAU}</button>`;
  place.replaceWith(duo);
  const kine = duo.querySelector<HTMLElement>(".mascotte")!, corbeau = duo.querySelector<HTMLElement>(".corbeau")!;
  const gk = geste(kine, GESTES_KINE), gc = geste(corbeau, [...TOUCHE_CORBEAU, ...SEUL_CORBEAU]);
  let nk = 0, nc = 0;
  kine.onclick = () => {
    const g = GESTES_KINE[nk++ % GESTES_KINE.length];
    gk.jouer(g);
    if (g === "saute" && !gc.occupe()) gc.jouer("ailes");   // le corbeau sursaute quand le kiné saute
  };
  corbeau.onclick = () => gc.jouer(TOUCHE_CORBEAU[nc++ % TOUCHE_CORBEAU.length]);

  /* de temps en temps, le corbeau fait quelque chose tout seul (toutes les 20 à 50 secondes), sauf si les animations
     sont réduites ou que l'appli n'est pas à l'écran ; le tour en vol reste rare */
  const calme = matchMedia("(prefers-reduced-motion: reduce)");
  const suivant = () => setTimeout(() => {
    if (!calme.matches && !document.hidden && !gc.occupe())
      gc.jouer(Math.random() < .15 ? "vol" : SEUL_CORBEAU[Math.floor(Math.random() * SEUL_CORBEAU.length)]);
    suivant();
  }, 20000 + Math.random() * 30000);
  suivant();
}
