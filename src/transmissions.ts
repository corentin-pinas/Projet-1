/* Transmissions pour un remplaçant : choisir la période, vérifier la liste des patients (rendez-vous notés dans l'appli),
   ajouter un mot, puis envoyer le PDF par message (menu de partage d'Android) ou l'enregistrer dans « Téléchargements ».
   Le PDF est fabriqué dans la tablette, sans IA : il reprend fidèlement bilans et séances. */
import * as db from "./db";
import {
  decalerJours, demiFr, frDate, HORAIRES_DEFAUT, isoDay, joursSansRdv, semaineProchaine, transmissions,
  type Horaires, type Transmission
} from "./regles";
import { esc, toast } from "./ui";

const PARAM_MOT = "transmissions_mot";
let vue: HTMLElement | null = null;
let du = "", au = "";
let exclus = new Set<string>();   // patients décochés

const jourCourt = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); };

export async function ouvrir() {
  [du, au] = semaineProchaine(isoDay(new Date()));
  exclus = new Set();
  vue?.remove();
  vue = document.createElement("div");
  vue.className = "agenda transmissions";
  vue.setAttribute("role", "dialog");
  vue.setAttribute("aria-label", "Transmissions pour un remplaçant");
  document.body.append(vue);
  const mot = (await db.lireParametre<string>(PARAM_MOT).catch(() => undefined)) ?? "";
  vue.innerHTML = `<div class="abar"><h2>Transmissions pour un remplaçant</h2><div class="row"><button class="primary" id="tfermer">Fermer</button></div></div>
    <div class="tcorps">
      <div class="tperiode">
        <label>Du <input type="date" id="tdu"></label>
        <label>Au <input type="date" id="tau"></label>
        <div class="bils" role="group" aria-label="Durée"><button data-jours="6">1 semaine</button><button data-jours="13">2 semaines</button><button data-jours="20">3 semaines</button></div>
      </div>
      <label for="tmot" class="tlabel">Mot pour le remplaçant (facultatif, gardé pour la prochaine fois)</label>
      <textarea id="tmot" rows="3" placeholder="Code de la porte, matériel, patients à rappeler…">${esc(mot)}</textarea>
      <div id="tliste"></div>
    </div>`;
  const v = vue;
  v.querySelector<HTMLElement>("#tfermer")!.onclick = fermer;
  const iDu = v.querySelector<HTMLInputElement>("#tdu")!, iAu = v.querySelector<HTMLInputElement>("#tau")!;
  const maj = () => { iDu.value = du; iAu.value = au; afficher(); };
  iDu.onchange = () => { if (!iDu.value) return; const ecart = Math.max(0, jours(du, au)); du = iDu.value; if (au < du) au = decalerJours(du, ecart); maj(); };
  iAu.onchange = () => { if (!iAu.value) return; au = iAu.value < du ? du : iAu.value; maj(); };
  v.querySelectorAll<HTMLElement>("[data-jours]").forEach(b => b.onclick = () => { au = decalerJours(du, +b.dataset.jours!); maj(); });
  v.querySelector<HTMLTextAreaElement>("#tmot")!.onchange = e => db.ecrireParametre(PARAM_MOT, (e.target as HTMLTextAreaElement).value);
  maj();
}

export function fermer() { vue?.remove(); vue = null; }

const jours = (a: string, b: string) => Math.round((new Date(b + "T12:00").getTime() - new Date(a + "T12:00").getTime()) / 864e5);

async function liste() {
  const d = await db.tout();
  const horaires = (await db.lireParametre<Horaires>("horaires").catch(() => undefined)) ?? HORAIRES_DEFAUT;
  return { patients: transmissions(d.dossiers, d.bilans, d.seances, du, au), vides: joursSansRdv(d.dossiers, horaires, du, au) };
}

async function afficher() {
  const v = vue;
  if (!v) return;
  const { patients, vides } = await liste();
  const el = v.querySelector<HTMLElement>("#tliste")!;
  const choisis = patients.filter(t => !exclus.has(t.dossier.id));
  el.innerHTML = (vides.length ? `<p class="check tvides"><b>Aucun rendez-vous noté :</b> ${vides.map(jourCourt).join(", ").replace(/\.$/, "")}. Vérifiez l'agenda avant d'envoyer.</p>` : "") +
    (patients.length
      ? `<p class="tcompte">${patients.length} patient${patients.length > 1 ? "s" : ""} avec rendez-vous du ${esc(frDate(du))} au ${esc(frDate(au))}${exclus.size ? ` · ${choisis.length} dans le PDF` : ""}. Décochez ceux que le remplaçant ne verra pas.</p>
        <div class="tpatients">${patients.map(ligne).join("")}</div>`
      : `<p class="empty">Aucun patient n'a de rendez-vous noté pendant cette période.</p>`) +
    `<div class="row tactions"><button class="primary" id="tenvoyer"${choisis.length ? "" : " disabled"}>Envoyer le PDF</button><button id="tenreg"${choisis.length ? "" : " disabled"}>Enregistrer le PDF</button></div>`;
  el.querySelectorAll<HTMLInputElement>("[data-inclus]").forEach(c => c.onchange = () => { if (c.checked) exclus.delete(c.dataset.inclus!); else exclus.add(c.dataset.inclus!); afficher(); });
  el.querySelector<HTMLElement>("#tenvoyer")!.onclick = () => produire(choisis, vides, true);
  el.querySelector<HTMLElement>("#tenreg")!.onclick = () => produire(choisis, vides, false);
}

function ligne(t: Transmission): string {
  const r = t.bilan?.resume;
  const manque = !t.bilan ? "Bilan à venir" : !r ? "Bilan pas encore résumé" : "";
  return `<label class="tpatient"><input type="checkbox" data-inclus="${esc(t.dossier.id)}"${exclus.has(t.dossier.id) ? "" : " checked"}>
    <span><b>${esc(t.dossier.label)}</b>${r?.region ? ` · ${esc(r.region)}` : ""}
    <small>${t.rdvs.map(x => esc(jourCourt(x.d) + (demiFr(x) ? " " + demiFr(x) : "") + (x.t === "bilan" ? " (bilan)" : ""))).join(" ; ")} · ${t.seances.length} séance${t.seances.length > 1 ? "s" : ""}${manque ? ` · <span class="pending">${manque}</span>` : ""}</small></span></label>`;
}

async function produire(patients: Transmission[], vides: string[], envoyer: boolean) {
  const mot = vue?.querySelector<HTMLTextAreaElement>("#tmot")?.value ?? "";
  db.ecrireParametre(PARAM_MOT, mot);
  try {
    const { fabriquerPdf, nomFichier } = await import("./transmissions-pdf");   // chargé seulement quand on s'en sert
    const blob = fabriquerPdf({ du, au, mot, patients, joursVides: vides });
    const fichier = new File([blob], nomFichier(du, au), { type: "application/pdf" });
    if (envoyer && navigator.canShare?.({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: "Transmissions" }); }
      catch (e) { if ((e as Error)?.name !== "AbortError") throw e; }
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = fichier.name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(envoyer ? "Le partage n'est pas possible ici : le PDF est enregistré dans « Téléchargements »." : "PDF enregistré dans « Téléchargements ».");
  } catch {
    toast("Le PDF n'a pas pu être fabriqué. Réessayez.");
  }
}
