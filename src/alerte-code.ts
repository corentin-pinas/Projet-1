/* Mauvais codes d'accès reçus par le serveur de l'appli (choix de Corentin, 6 novembre 2026) : dès le 3e en 24 heures,
   un bandeau le dit, avec l'heure du dernier. « C'est moi » le fait disparaître jusqu'au prochain mauvais code.
   Le serveur garde ce compte en mémoire seulement (remis à zéro à chaque nouvelle version). */
import * as db from "./db";
import { esc } from "./ui";

export const SEUIL_REFUS = 3;
const VU = "refus_code_vu";   // heure du dernier mauvais code déjà vu par Corentin sur cet appareil

/* faut-il prévenir ? (règle pure, testée) */
export function aPrevenir(refus: { n: number; dernier: string | null } | undefined, vu: string | undefined): boolean {
  return !!refus && refus.n >= SEUIL_REFUS && !!refus.dernier && (!vu || refus.dernier > vu);
}

let derniere = 0;
export async function verifier(force = false) {
  if (!force && Date.now() - derniere < 10 * 60_000) return;
  derniere = Date.now();
  const code = await db.lireParametre<string>("code_acces").catch(() => undefined);
  if (!code || !navigator.onLine) return;
  let refus: { n: number; dernier: string | null } | undefined;
  try {
    const r = await fetch("/api/ia/etat", { headers: { Authorization: "Bearer " + code }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return;
    refus = (await r.json()).refus;
  } catch { return; }
  const vu = await db.lireParametre<string>(VU).catch(() => undefined);
  const el = document.querySelector<HTMLElement>("#alertecode");
  if (!el) return;
  if (!aPrevenir(refus, vu)) { el.hidden = true; return; }
  const heure = new Date(refus!.dernier!).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `<span><b>${refus!.n} mauvais codes d'accès</b> ont été essayés sur le serveur de l'appli en 24 heures (dernier : ${esc(heure)}).
      Si ce n'est pas vous, changez le code : demandez à Claude de vous guider.</span>
    <button class="primary" id="alertecodevu">C'est moi</button>`;
  el.hidden = false;
  el.querySelector<HTMLElement>("#alertecodevu")!.onclick = async () => {
    await db.ecrireParametre(VU, refus!.dernier).catch(() => {});
    el.hidden = true;
  };
}

export function brancher() {
  verifier(true);
  setInterval(() => verifier(), 60 * 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) verifier(); });
  window.addEventListener("online", () => verifier());
}
