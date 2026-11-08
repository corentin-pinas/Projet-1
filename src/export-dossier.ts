/* Réglages → « Dossier d'un patient en PDF » (pour un contrôle) : choix du patient (archivés compris), puis PDF
   enregistré dans « Téléchargements ». Le fabricant du PDF n'est chargé qu'au moment de s'en servir. */
import * as db from "./db";
import { ageDossier, estArchive, frDate } from "./regles";
import { esc, toast } from "./ui";

export function brancher() {
  const choix = document.querySelector<HTMLSelectElement>("#regpatient");
  const bouton = document.querySelector<HTMLButtonElement>("#regpdf");
  if (!choix || !bouton) return;
  const remplir = async () => {
    const { dossiers } = await db.tout().catch(() => ({ dossiers: [] as Awaited<ReturnType<typeof db.tout>>["dossiers"] }));
    const tries = [...dossiers].sort((a, b) => Number(estArchive(a)) - Number(estArchive(b)) || a.label.localeCompare(b.label, "fr"));
    choix.innerHTML = tries.length
      ? tries.map(d => `<option value="${esc(d.id)}">${esc(d.label)}${estArchive(d) ? ` (archivé, fin le ${esc(frDate(d.fin!))})` : ""}</option>`).join("")
      : `<option value="">Aucun patient</option>`;
    bouton.disabled = !tries.length;
  };
  document.querySelector<HTMLElement>("#regbtn")?.addEventListener("click", () => { remplir(); });
  bouton.onclick = async () => {
    const id = choix.value; if (!id) return;
    bouton.disabled = true;
    try {
      const { dossiers, bilans, seances } = await db.tout();
      const D = dossiers.find(d => d.id === id);
      if (!D) return;
      const siens = bilans.filter(b => b.dossierId === id);
      const { fabriquerDossierPdf, nomDossierPdf } = await import("./dossier-pdf");
      const blob = fabriquerDossierPdf({ dossier: D, age: ageDossier(siens), bilans: siens, seances: seances.filter(s => s.dossierId === id) });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = nomDossierPdf(D.label);
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast(`Dossier de ${D.label} enregistré dans « Téléchargements ».`);
    } catch { toast("Le PDF n'a pas pu être créé. Réessayez."); }
    finally { bouton.disabled = false; }
  };
}
