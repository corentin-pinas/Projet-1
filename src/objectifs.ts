/* Objectifs du patient (1.8.0, choix de Corentin du 12 novembre 2026) : un encadré en haut de la fiche. Au départ, ceux du
   bilan (objectifs SMART de la trame ou écrits ailleurs) ; « Modifier » à tout moment ; une dictée qui en énonce de nouveaux
   les propose (« Remplacer », « Ajouter », « Ignorer »), sur la fiche et dans le récapitulatif de la dictée groupée :
   jamais changés sans son accord. La version précédente reste dans l'historique du dossier. Règles dans regles.ts. */
import * as db from "./db";
import { avecObjectifs, frDate, objectifsDe, type Bilan, type Dossier } from "./regles";
import { esc, toast } from "./ui";

let edition: string | null = null;   // dossier dont les objectifs sont en cours de modification
export const enEdition = () => edition !== null;
export const quitter = () => { edition = null; };

const origine = (o: { maj: string; source: string }) =>
  o.source === "bilan" ? "D'après le bilan" : `Mis à jour le ${frDate(o.maj.slice(0, 10)).slice(0, 5)}${o.source === "dictee" ? " (dictée)" : ""}`;

export function encadre(D: Dossier, bilans: Bilan[]): string {
  const o = objectifsDe(D, bilans);
  if (edition === D.id) return `<section class="objectifs" aria-label="Objectifs du patient"><b>🎯 Objectifs</b>
    <label class="note" for="objtexte">Un objectif par ligne.</label>
    <textarea id="objtexte" rows="4">${esc((o?.liste ?? []).join("\n"))}</textarea>
    <div class="row"><button class="primary" id="objsave">Enregistrer</button><button id="objannuler">Annuler</button></div></section>`;
  return `<section class="objectifs" aria-label="Objectifs du patient">
    <div class="objtete"><b>🎯 Objectifs</b>${o ? `<button class="lien" id="objmodif">Modifier</button>` : ""}</div>
    ${o ? `<ul>${o.liste.map(x => `<li>${esc(x)}</li>`).join("")}</ul><p class="note">${esc(origine(o))}</p>`
      : `<p class="note">Pas encore d'objectifs notés.</p><div class="row"><button id="objmodif">Ajouter les objectifs</button></div>`}</section>`;
}

/* objectifs dits dans une dictée, à confirmer */
export function proposition(D: Dossier, nom = ""): string {
  const p = D.objectifs_propose;
  if (!p?.liste.length) return "";
  return `<div class="question-rdv objpropose" data-objp="${esc(D.id)}">
    <b>${nom ? esc(nom) + " : nouveaux objectifs ?" : "Nouveaux objectifs ?"}</b>
    <p class="note">Dits dans la séance du ${esc(frDate(p.date))} :</p>
    <ul>${p.liste.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    <div class="row"><button class="primary" data-objp-remplacer>Remplacer les objectifs</button><button data-objp-ajouter>Ajouter</button><button data-objp-ignorer>Ignorer</button></div></div>`;
}

async function enregistrer(id: string, f: (D: Dossier, bilans: Bilan[]) => Dossier, message: string, apres?: () => void) {
  try {
    const { bilans } = await db.tout();
    await db.modifierDossier(id, d => f(d, bilans));
    toast(message);
    apres?.();
  } catch { toast("L'enregistrement a échoué. Réessayez."); }
}

export function brancher(racine: HTMLElement, D: Dossier | null, redessiner: () => void) {
  const maintenant = () => new Date().toISOString();
  if (D) {
    const modif = racine.querySelector<HTMLElement>("#objmodif");
    if (modif) modif.onclick = () => { edition = D.id; redessiner(); racine.querySelector<HTMLTextAreaElement>("#objtexte")?.focus(); };
    const annuler = racine.querySelector<HTMLElement>("#objannuler");
    if (annuler) annuler.onclick = () => { edition = null; redessiner(); };
    const save = racine.querySelector<HTMLElement>("#objsave");
    if (save) save.onclick = () => {
      const liste = racine.querySelector<HTMLTextAreaElement>("#objtexte")!.value.split("\n");
      edition = null;
      enregistrer(D.id, (d, bilans) => avecObjectifs(d, liste, "main", maintenant(), objectifsDe(d, bilans)), "Objectifs enregistrés.", redessiner);
    };
  }
  racine.querySelectorAll<HTMLElement>(".objpropose").forEach(q => {
    const id = q.dataset.objp!;
    const sans = (d: Dossier): Dossier => { const { objectifs_propose: _, ...reste } = d; return reste; };
    q.querySelector<HTMLElement>("[data-objp-remplacer]")!.onclick = () =>
      enregistrer(id, (d, bilans) => sans(avecObjectifs(d, d.objectifs_propose?.liste ?? [], "dictee", maintenant(), objectifsDe(d, bilans))), "Objectifs remplacés.", redessiner);
    q.querySelector<HTMLElement>("[data-objp-ajouter]")!.onclick = () =>
      enregistrer(id, (d, bilans) => { const a = objectifsDe(d, bilans); return sans(avecObjectifs(d, [...(a?.liste ?? []), ...(d.objectifs_propose?.liste ?? [])], "dictee", maintenant(), a)); }, "Objectifs ajoutés.", redessiner);
    q.querySelector<HTMLElement>("[data-objp-ignorer]")!.onclick = () => enregistrer(id, d => sans(d), "Proposition ignorée.", redessiner);
  });
}
