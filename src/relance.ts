/* Relances automatiques après un échec (audit M8, choix de Corentin du 6 novembre 2026) : rangement de la dictée,
   transcription de la voix, mise au propre d'une séance. Toutes les 5 minutes, 3 essais au plus en comptant le premier ;
   sans réseau, dès son retour ; jamais quand relancer ne changerait rien (quota atteint, code refusé, réglage manquant).
   Seulement tant que Muninn est ouvert (pas de travail en tâche de fond, choix du 6 novembre). */
import { natureDe } from "./ia";

export const DELAI_RELANCE = 5 * 60_000;
export const ESSAIS_MAX = 3;

/* essai : numéro du prochain essai ; quand : son heure, ou null = au retour du réseau ; cause : pourquoi le dernier a échoué */
export type Plan = { essai: number; quand: number | null; cause: string };

/* après l'échec de l'essai n° « essai » : le prochain essai, ou null s'il n'y en aura pas (règle pure, testée) */
export function apresEchec(e: unknown, essai: number, maintenant = Date.now()): Plan | null {
  const nature = natureDe(e);
  if (nature === "definitif" || essai >= ESSAIS_MAX) return null;
  /* « Réessayez plus tard » n'a plus de sens quand Muninn réessaie lui-même */
  const cause = (e instanceof Error && e.message ? e.message : "l'essai a échoué.").replace(/\s*(?:Votre texte est gardé : )?[Rr]éessayez[^.]*\.?\s*$/, "").trim();
  return { essai: essai + 1, quand: nature === "reseau" ? null : maintenant + DELAI_RELANCE, cause };
}

export function rebours(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`;
}

/* une phrase pour l'écran : « Nouvel essai dans 4 min 32 s (essai 2 sur 3). » ; le compte à rebours bouge tout seul */
export function phrase(p: Plan): string {
  const quand = p.quand == null ? "dès le retour du réseau" : `dans <span data-rebours="${p.quand}">${rebours(p.quand - Date.now())}</span>`;
  return `Nouvel essai ${quand} (essai ${p.essai} sur ${ESSAIS_MAX}).`;
}
if (typeof document !== "undefined") setInterval(() => {
  document.querySelectorAll<HTMLElement>("[data-rebours]").forEach(el => { el.textContent = rebours(Number(el.dataset.rebours) - Date.now()); });
}, 1000);

/* Un travail relançable : echec() prévoit le prochain essai (ou rien), maintenant() le lance tout de suite,
   annuler() l'oublie (essai réussi, travail effacé, nouvel essai à la main). lancer(essai) refait le travail. */
export class Relanceur {
  plan: Plan | null = null;
  private minuterie: ReturnType<typeof setTimeout> | undefined;
  private reseau: (() => void) | null = null;
  constructor(private lancer: (essai: number) => void, private surChange: () => void = () => {}) {}

  echec(e: unknown, essai: number): Plan | null {
    this.annuler();
    const p = apresEchec(e, essai);
    this.plan = p;
    if (p?.quand == null && p) {
      this.reseau = () => this.maintenant();
      window.addEventListener("online", this.reseau, { once: true });
    } else if (p) this.minuterie = setTimeout(() => this.maintenant(), Math.max(0, p.quand! - Date.now()));
    this.surChange();
    return p;
  }

  maintenant() {
    const p = this.plan;
    this.annuler();
    if (p) this.lancer(p.essai);
  }

  annuler() {
    clearTimeout(this.minuterie); this.minuterie = undefined;
    if (this.reseau) { window.removeEventListener("online", this.reseau); this.reseau = null; }
    this.plan = null;
  }
}
