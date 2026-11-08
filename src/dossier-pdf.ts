/* Dossier complet d'un patient en PDF, pour un contrôle (choix de Corentin du 8 novembre 2026) : bilans résumés,
   toutes les séances datées, rendez-vous et absences, fin de traitement. Fabriqué dans l'appareil, sans IA ni serveur :
   fidèle à ce qui est enregistré. Ouvert depuis les Réglages (roue dentée). */
import { jsPDF } from "jspdf";
import { demiFr, estArchive, frDate, texteDe, trierBilans, type Bilan, type Dossier, type Seance } from "./regles";
import { propre } from "./transmissions-pdf";

export type DossierPdf = { dossier: Dossier; age: number | null; bilans: Bilan[]; seances: Seance[] };

export function fabriquerDossierPdf({ dossier: D, age, bilans, seances }: DossierPdf): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, H = 297, M = 16, LARG = L - 2 * M, BAS = H - 16;
  const encre = "#1C2A2E", doux = "#5B6B6F", accent = "#3F3A6E";
  let y = M;
  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = M; } };
  const texte = (t: string, o: { taille?: number; gras?: boolean; couleur?: string; retrait?: number; apres?: number } = {}) => {
    const taille = o.taille ?? 10, retrait = o.retrait ?? 0, ligne = taille * 0.42;
    doc.setFont("helvetica", o.gras ? "bold" : "normal").setFontSize(taille).setTextColor(o.couleur ?? encre);
    for (const l of doc.splitTextToSize(propre(t), LARG - retrait) as string[]) { place(ligne); doc.text(l, M + retrait, y + ligne * 0.8); y += ligne; }
    y += o.apres ?? 1.2;
  };
  const titre = (t: string) => { place(16); y += 3; texte(t, { taille: 13, gras: true, couleur: accent, apres: 2 }); };

  const lesSeances = [...seances].sort((a, b) => a.date.localeCompare(b.date) || String(a.cree).localeCompare(String(b.cree)));
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(accent).text(propre("Dossier de " + D.label + (age != null ? ", " + age + " ans" : "")), M, y + 7);
  y += 12;
  texte(estArchive(D) ? `Dossier archivé : fin de traitement le ${frDate(D.fin!)}.` : "Patient en soins.", { taille: 11, gras: true });
  texte(`Dossier créé le ${frDate(String(D.cree).slice(0, 10))} · ${bilans.length} bilan${bilans.length > 1 ? "s" : ""} · ${lesSeances.length} séance${lesSeances.length > 1 ? "s" : ""}`
    + (lesSeances.length ? ` du ${frDate(lesSeances[0].date)} au ${frDate(lesSeances[lesSeances.length - 1].date)}` : "") + ` · édité le ${frDate(new Date().toISOString().slice(0, 10))} avec Muninn`, { couleur: doux, apres: 3 });

  titre("Bilans");
  if (!bilans.length) texte("Aucun bilan dans l'appli.", { couleur: doux });
  for (const b of trierBilans(bilans).reverse()) {
    const r = b.resume;
    place(14);
    texte(`Bilan${r?.date_bilan ? " du " + r.date_bilan : ""} (ajouté le ${frDate(String(b.ajoute).slice(0, 10))})${r?.region ? " · " + r.region : ""}`, { gras: true, apres: 0.6 });
    if (!r) { texte("Résumé pas encore fait : voir le document d'origine.", { couleur: doux, retrait: 3 }); continue; }
    if (r.coup_oeil) texte(r.coup_oeil, { retrait: 3 });
    if (r.chiffres?.length) texte("Chiffres : " + r.chiffres.map(c => `${c.label} ${c.valeur}`).join(" · "), { retrait: 3 });
    for (const s of r.sections || []) if (s.items?.length) texte(`${s.titre} : ${s.items.join(" ; ")}`, { retrait: 3 });
    if (b.corrections.length) texte("Corrigé par le kinésithérapeute : " + b.corrections.map(c => `${c.point} -> ${c.correction}`).join(" ; "), { retrait: 3, couleur: doux });
    y += 2;
  }

  titre("Séances");
  if (!lesSeances.length) texte("Aucune séance notée.", { couleur: doux });
  lesSeances.forEach((s, i) => {
    place(14);
    texte(`Séance ${i + 1}, le ${frDate(s.date)}`, { gras: true, apres: 0.5 });
    for (const l of texteDe(s).split("\n").filter(x => x.trim())) texte(l, { retrait: 3, apres: 0.5 });
    y += 2;
  });

  titre("Rendez-vous et absences");
  const rdvs = [...D.rdvs].filter(Boolean).sort((a, b) => a.d.localeCompare(b.d));
  texte(rdvs.length ? rdvs.map(r => frDate(r.d) + (demiFr(r) ? " " + demiFr(r) : "") + (r.t === "bilan" ? " (bilan)" : "")).join(" ; ") : "Aucun rendez-vous noté.", { couleur: rdvs.length ? encre : doux });
  if (D.absences?.length) texte("Absences : " + [...D.absences].sort().map(frDate).join(" ; "));
  if (D.fin) texte(`Fin de traitement notée le ${frDate(D.fin)}.`);

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(doux);
    doc.text(propre("Données de santé confidentielles · dossier de " + D.label), M, H - 8);
    doc.text(`${p} / ${n}`, L - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}

export const nomDossierPdf = (label: string) => `Dossier ${label.replace(/[^\p{L}\p{N} .-]/gu, "").trim()} ${frDate(new Date().toISOString().slice(0, 10)).replace(/\//g, "-")}.pdf`;
