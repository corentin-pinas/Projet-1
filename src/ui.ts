/* Petits éléments d'écran partagés : messages, confirmation. */

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function toast(texte: string) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const d = document.createElement("div");
  d.className = "toast";
  d.setAttribute("role", "status");
  d.textContent = texte;
  // une fenêtre ouverte passe au-dessus de tout : le message doit s'afficher dedans pour rester visible
  (document.querySelector("dialog[open]") ?? document.body).append(d);
  setTimeout(() => d.remove(), 3500);
}

/* Fenêtre de confirmation à gros boutons, plus lisible sur tablette que celle du navigateur. */
export function confirmer(texte: string, bouton: string, annuler = "Annuler"): Promise<boolean> {
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "confirm";
    d.innerHTML = `<p></p><div class="row"><button class="danger" value="oui"></button><button value="non" autofocus></button></div>`;
    d.querySelector("p")!.textContent = texte;
    d.querySelector<HTMLButtonElement>(".danger")!.textContent = bouton;
    d.querySelector<HTMLButtonElement>("[value=non]")!.textContent = annuler;
    d.querySelectorAll("button").forEach(b => b.onclick = () => d.close(b.value));
    d.addEventListener("close", () => { resolve(d.returnValue === "oui"); d.remove(); });
    document.body.append(d);
    d.showModal();
  });
}

/* raccourci pour trouver un élément de la page */
export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

/* Petit graphique d'évolution (2.0.0) : un point par valeur écrite, le dernier en couleur ; placés selon la date,
   un trou dans le suivi se voit. « tend » : tendance dite sans chiffre, un trait en pointillés vers un cercle vide. */
export function courbe(points: { date: string; v: number }[], o: { l?: number; h?: number; tend?: -1 | 1 } = {}): string {
  if (points.length < 2 && !o.tend) return "";
  const W = o.l ?? 90, H = o.h ?? 30, bout = o.tend ? 14 : 4;
  const dates = points.map(p => Date.parse(p.date) / 864e5), memeJour = Math.max(...dates) - Math.min(...dates) < 1;
  const jours = memeJour ? points.map((_, i) => i) : dates, j0 = Math.min(...jours), dj = (Math.max(...jours) - j0) || 1;   // tous le même jour : à intervalles réguliers
  const vs = points.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = (hi - lo) || 1;
  const pts = points.map((p, i) => [4 + (points.length > 1 ? (jours[i] - j0) / dj : 1) * (W - 4 - bout), H - 6 - (p.v - lo) / sp * (H - 12)]);
  const der = pts[pts.length - 1];
  let t = "";
  if (o.tend && der) { const x2 = der[0] + 11, y2 = Math.max(4, Math.min(H - 4, der[1] + o.tend * 9));
    t = `<path d="M${der[0]} ${der[1]} L${x2} ${y2}" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" fill="none"/><circle class="vide" cx="${x2}" cy="${y2}" r="3.4" fill="none" stroke="currentColor" stroke-width="2"/>`; }
  return `<svg class="courbe" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${pts.length > 1 ? `<polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(",")).join(" ")}"/>` : ""}${pts.map((p, i) => `<circle${i === pts.length - 1 ? ' class="der"' : ""} cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.6 : points.length > 10 ? 1.8 : 2.4}"/>`).join("")}${t ? `<g class="tendc">${t}</g>` : ""}</svg>`;
}
