/* « Prochain rendez-vous ? » (choix de Corentin, 5 novembre 2026) : quand une séance ne dit pas clairement quand le patient
   revient, l'appli le demande, sur la fiche et dans le récapitulatif de la dictée groupée. Une date, puis « Matin » ou
   « Après-midi » (un seul geste pour enregistrer), ou « Fin de traitement ». La règle qui décide de poser la question
   est questionRdv, dans regles.ts. */
import * as db from "./db";
import { avecRdv, decalerJours, isoDay, type Demi, type Dossier } from "./regles";
import { esc, toast } from "./ui";

/* nom : affiché quand plusieurs patients sont demandés à la suite (dictée groupée) */
export function question(D: Dossier, dateSeance: string, nom = ""): string {
  const auj = isoDay(new Date());
  const semaine = decalerJours(dateSeance, 7);
  const propose = semaine > auj ? semaine : decalerJours(auj, 1);
  return `<div class="question-rdv" data-qrdv="${esc(D.id)}" data-seance="${esc(dateSeance)}">
    <b>${nom ? esc(nom) + " : prochain rendez-vous ?" : "Prochain rendez-vous ?"}</b>
    <div class="row"><input type="date" class="qdate" value="${propose}" min="${auj}" aria-label="Date du prochain rendez-vous${nom ? " de " + esc(nom) : ""}">
      <button class="primary" data-qdemi="am">Matin</button><button class="primary" data-qdemi="pm">Après-midi</button>
      <button data-qfin>Fin de traitement</button></div></div>`;
}

export function brancher(racine: HTMLElement, apres?: () => void) {
  racine.querySelectorAll<HTMLElement>(".question-rdv").forEach(q => {
    const id = q.dataset.qrdv!, seance = q.dataset.seance!;
    q.querySelectorAll<HTMLButtonElement>("[data-qdemi]").forEach(b => b.onclick = async () => {
      const date = q.querySelector<HTMLInputElement>(".qdate")!.value;
      if (!date) { toast("Indiquez la date du prochain rendez-vous."); return; }
      try {
        await db.modifierRdvs(id, rdvs => avecRdv(rdvs, date, "", undefined, b.dataset.qdemi as Demi));
        toast("Rendez-vous enregistré.");
        apres?.();
      } catch { toast("L'enregistrement a échoué. Réessayez."); }
    });
    const fin = q.querySelector<HTMLButtonElement>("[data-qfin]");
    if (fin) fin.onclick = async () => {
      try { await db.finTraitement(id, seance); toast("Fin de traitement notée."); apres?.(); }
      catch { toast("L'enregistrement a échoué. Réessayez."); }
    };
  });
}
