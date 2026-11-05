/* Séances manquantes (choix de Corentin, 5 novembre 2026). Un rendez-vous passé sans séance ce jour-là apparaît dans la
   liste des séances de la fiche, et dans le récapitulatif de la dictée groupée : « Retrouver dans mes dictées » (l'IA
   légère relit la dictée gardée de ce jour-là et montre le passage ; « Ranger cette séance » en fait une séance normale)
   ou « Il était absent » (absence notée sur le dossier). Un lien permet aussi de chercher un autre jour. */
import { ErreurIA } from "./ia";
import * as db from "./db";
import * as moteur from "./moteur";
import { DEMI_FR, isoDay, type Demi, type Dossier } from "./regles";
import { esc, toast } from "./ui";

type Etat = { etat: "cherche" } | { etat: "trouve"; extrait: string } | { etat: "rien"; message: string };
const etats = new Map<string, Etat>();          // dossier|jour -> recherche en cours ou faite
const autreJour = new Map<string, string>();    // dossier -> jour choisi avec le lien « un autre jour »
const cle = (id: string, d: string) => id + "|" + d;
const jourFr = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const Jour = (d: string) => { const t = jourFr(d); return t.charAt(0).toUpperCase() + t.slice(1); };

/* le bloc d'un jour manquant ; nom : affiché devant quand plusieurs patients se suivent (dictée groupée) */
export function bloc(D: Dossier, d: string, demi: Demi | null, nom = "", libre = false): string {
  const attrs = `data-mdos="${esc(D.id)}" data-mjour="${esc(d)}"`;
  const titre = `${nom ? esc(nom) + " · " : ""}${esc(Jour(d))}${demi ? ", " + DEMI_FR[demi] : ""}`;
  const e = etats.get(cle(D.id, d));
  if (e?.etat === "cherche") return `<div class="trou" ${attrs} role="status"><b>${titre} :</b> recherche dans la dictée de ce jour-là…</div>`;
  if (e?.etat === "trouve") return `<div class="trouve" ${attrs}><b>${nom ? esc(nom) + " · t" : "T"}rouvé dans votre dictée du ${esc(jourFr(d))} :</b>
      <blockquote>${esc(e.extrait)}</blockquote>
      <div class="row"><button class="primary" data-mranger>Ranger cette séance</button><button data-mpaslui>Ce n'est pas ${nom ? "ce patient" : "lui"}</button></div></div>`;
  const texte = e?.etat === "rien" ? esc(e.message)
    : libre ? "aucune séance notée ce jour-là." : "rendez-vous prévu, aucune séance notée.";
  return `<div class="trou" ${attrs}><b>${titre} :</b> ${texte}
      <div class="row">${e?.etat === "rien" ? "" : `<button class="primary" data-mchercher>Retrouver dans mes dictées</button>`}<button data-mabsent>Il était absent</button>${libre || e?.etat === "rien" ? `<button data-mfermer>Fermer</button>` : ""}</div></div>`;
}

export function absence(D: Dossier, d: string): string {
  return `<div class="absence" data-mdos="${esc(D.id)}" data-mjour="${esc(d)}">Absent le ${esc(jourFr(d))}<button data-mpresent>Annuler</button></div>`;
}

/* lien en bas de la liste des séances : chercher un autre jour (sans rendez-vous noté) */
export function lienAutreJour(D: Dossier): string {
  const d = autreJour.get(D.id);
  if (d) return bloc(D, d, null, "", true);
  return `<div class="autrejour" data-mdos="${esc(D.id)}"><button class="lien" data-mautre>Une séance manque un autre jour ? Retrouver dans mes dictées</button>
    <span class="choixjour" hidden><input type="date" max="${isoDay(new Date())}" aria-label="Jour de la séance manquante"><button class="primary" data-mautrego>Chercher</button></span></div>`;
}

export function brancher(racine: HTMLElement, redessiner: () => void) {
  const fin = (id: string, d: string) => { etats.delete(cle(id, d)); if (autreJour.get(id) === d) autreJour.delete(id); };

  const chercher = async (id: string, d: string) => {
    etats.set(cle(id, d), { etat: "cherche" }); redessiner();
    try {
      const extrait = await moteur.chercherSeance(id, d);
      etats.set(cle(id, d), extrait ? { etat: "trouve", extrait } : { etat: "rien", message: "rien trouvé pour ce patient dans la dictée de ce jour-là." });
    } catch (e) {
      etats.set(cle(id, d), { etat: "rien", message: e instanceof ErreurIA ? e.message : "la recherche a échoué. Réessayez plus tard." });
    }
    redessiner();
  };

  racine.querySelectorAll<HTMLElement>(".trou[data-mdos], .trouve[data-mdos], .absence[data-mdos]").forEach(el => {
    const id = el.dataset.mdos!, d = el.dataset.mjour!;
    const on = (sel: string, f: () => void) => { const b = el.querySelector<HTMLElement>(sel); if (b) b.onclick = f; };
    on("[data-mchercher]", () => chercher(id, d));
    on("[data-mabsent]", async () => {
      try { await db.noterAbsence(id, d, true); fin(id, d); toast("Absence notée."); redessiner(); }
      catch { toast("L'enregistrement a échoué. Réessayez."); }
    });
    on("[data-mpresent]", async () => {
      try { await db.noterAbsence(id, d, false); redessiner(); } catch { toast("L'enregistrement a échoué. Réessayez."); }
    });
    on("[data-mpaslui]", () => { etats.set(cle(id, d), { etat: "rien", message: "passage écarté. Rien n'a été rangé." }); redessiner(); });
    on("[data-mfermer]", () => { fin(id, d); redessiner(); });
    on("[data-mranger]", async () => {
      const e = etats.get(cle(id, d));
      if (e?.etat !== "trouve") return;
      try { await moteur.rangerPassage(id, d, e.extrait); fin(id, d); toast("Séance rangée."); redessiner(); }
      catch { toast("L'enregistrement a échoué. Réessayez."); }
    });
  });

  racine.querySelectorAll<HTMLElement>(".autrejour[data-mdos]").forEach(el => {
    const id = el.dataset.mdos!;
    const choix = el.querySelector<HTMLElement>(".choixjour")!;
    el.querySelector<HTMLElement>("[data-mautre]")!.onclick = () => { choix.hidden = false; choix.querySelector("input")!.focus(); };
    el.querySelector<HTMLElement>("[data-mautrego]")!.onclick = () => {
      const d = choix.querySelector("input")!.value;
      if (!d) { toast("Choisissez le jour de la séance manquante."); return; }
      autreJour.set(id, d);
      chercher(id, d);
    };
  });
}

