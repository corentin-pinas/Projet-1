/* Mascotte : un petit kiné à lunettes (pas un docteur), à côté du titre. Inspiré d'une appli qu'aime Corentin :
   au repos il flotte doucement et cligne des yeux ; quand on le touche, il réagit (rire, saut, étirement de kiné). */

const SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
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
