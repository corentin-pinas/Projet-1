/* Petits éléments d'écran partagés : messages, confirmation. */

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function toast(texte: string) {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const d = document.createElement("div");
  d.className = "toast";
  d.setAttribute("role", "status");
  d.textContent = texte;
  document.body.append(d);
  setTimeout(() => d.remove(), 3500);
}

/* Fenêtre de confirmation à gros boutons, plus lisible sur tablette que celle du navigateur. */
export function confirmer(texte: string, bouton: string): Promise<boolean> {
  return new Promise(resolve => {
    const d = document.createElement("dialog");
    d.className = "confirm";
    d.innerHTML = `<p></p><div class="row"><button class="danger" value="oui"></button><button value="non" autofocus>Annuler</button></div>`;
    d.querySelector("p")!.textContent = texte;
    d.querySelector<HTMLButtonElement>(".danger")!.textContent = bouton;
    d.querySelectorAll("button").forEach(b => b.onclick = () => d.close(b.value));
    d.addEventListener("close", () => { resolve(d.returnValue === "oui"); d.remove(); });
    document.body.append(d);
    d.showModal();
  });
}
