/* Mascotte : un petit kiné à lunettes (pas un docteur), à côté du titre. Inspiré d'une appli qu'aime Corentin :
   au repos il flotte doucement et cligne des yeux ; quand on le touche, il réagit (rire, saut, étirement de kiné). */

const SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <g class="m-corps">
    <ellipse class="m-bras g" cx="9.5" cy="37" rx="3.6" ry="5.5"/><ellipse class="m-bras d" cx="54.5" cy="37" rx="3.6" ry="5.5"/>
    <ellipse cx="24" cy="57.5" rx="5.5" ry="3.2" class="m-pied"/><ellipse cx="40" cy="57.5" rx="5.5" ry="3.2" class="m-pied"/>
    <ellipse cx="32" cy="32" rx="23" ry="24.5" class="m-peau"/>
    <path d="M27 9.5q3-6 6-1.5q2-4 5 0" class="m-trait" stroke-width="2"/>
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
    <g class="m-lunettes"><circle cx="25" cy="29.5" r="6.6"/><circle cx="39" cy="29.5" r="6.6"/><path d="M31.6 29q.4-1.6.8 0"/></g>
  </g></svg>`;

const REACTIONS = ["rit", "saute", "etire"];

export function installer(place: HTMLElement) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mascotte";
  b.setAttribute("aria-label", "Le petit kiné (touchez-le)");
  b.innerHTML = SVG;
  place.replaceWith(b);
  let n = 0, minuterie: ReturnType<typeof setTimeout> | undefined;
  b.onclick = () => {
    clearTimeout(minuterie);
    REACTIONS.forEach(r => b.classList.remove(r));
    void b.offsetWidth;   // relance l'animation même si on tape plusieurs fois de suite
    b.classList.add(REACTIONS[n++ % REACTIONS.length]);
    minuterie = setTimeout(() => REACTIONS.forEach(r => b.classList.remove(r)), 1800);
  };
}
