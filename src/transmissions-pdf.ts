/* PDF des transmissions pour un remplaçant, fabriqué dans la tablette (rien ne passe par le serveur ni par l'IA).
   Page 1 : la période, le mot pour le remplaçant, le planning jour par jour. Ensuite, une fiche par patient :
   rendez-vous de la période, ce qui est prévu pour la suite, le bilan (coup d'œil, chiffres, rubriques), les deux dernières séances.
   Fidèle à ce qui est enregistré : aucun résumé n'est inventé. */
import { jsPDF } from "jspdf";
import { demiDe, demiFr, frDate, rdvKey, texteDe, type Rdv, type Transmission } from "./regles";

/* police intégrée du PDF (Helvetica) : alphabet latin et ponctuation française ; le reste est remplacé */
const AUTRES = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const REMPLACE: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≈": "~", " ": " ", " ": " ", "✓": "OK", "…": "..." };
export function propre(t: string): string {
  return [...String(t ?? "")].map(c => REMPLACE[c] ?? (c.charCodeAt(0) < 256 || AUTRES.includes(c) ? c : "")).join("");
}

const jourLong = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
const jourCourt = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }); };
const maj = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const rdvTexte = (r: Rdv) => jourCourt(r.d) + (demiFr(r) ? " " + demiFr(r) : "") + (r.t === "bilan" ? " (bilan)" : "");

export type OptionsPdf = { du: string; au: string; mot: string; patients: Transmission[]; joursVides: string[] };

export function fabriquerPdf({ du, au, mot, patients, joursVides }: OptionsPdf): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 210, H = 297, M = 16, LARG = L - 2 * M, BAS = H - 16;
  let y = M;
  const encre = "#1C2A2E", doux = "#5B6B6F", accent = "#3F3A6E", fondAccent = "#ECEAF5";

  const place = (h: number) => { if (y + h > BAS) { doc.addPage(); y = M; } };
  /* paragraphe coupé à la largeur, sur plusieurs pages si besoin */
  const texte = (t: string, o: { taille?: number; gras?: boolean; couleur?: string; retrait?: number; apres?: number } = {}) => {
    const taille = o.taille ?? 10, retrait = o.retrait ?? 0, ligne = taille * 0.42;
    doc.setFont("helvetica", o.gras ? "bold" : "normal").setFontSize(taille).setTextColor(o.couleur ?? encre);
    for (const l of doc.splitTextToSize(propre(t), LARG - retrait) as string[]) { place(ligne); doc.text(l, M + retrait, y + ligne * 0.8); y += ligne; }
    y += o.apres ?? 1.2;
  };
  /* « Libellé : texte », libellé en gras */
  const champ = (libelle: string, t: string, retrait = 0) => {
    if (!t.trim()) return;
    texte(libelle + " : " + t, { retrait });
  };

  /* ---------- page 1 : période, mot, planning ---------- */
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(accent).text("Transmissions", M, y + 7);
  y += 11;
  texte(`Du ${jourLong(du)} au ${jourLong(au)} ${au.slice(0, 4)}`, { taille: 13, gras: true });
  texte(`${patients.length} patient${patients.length > 1 ? "s" : ""} · préparé le ${frDate(new Date().toISOString().slice(0, 10))} avec Muninn`, { couleur: doux, apres: 4 });
  if (mot.trim()) {
    texte("Mot pour le remplaçant", { taille: 12, gras: true, couleur: accent });
    texte(mot, { apres: 4 });
  }
  if (joursVides.length) texte("Aucun rendez-vous noté dans l'appli : " + joursVides.map(jourCourt).join(", ").replace(/\.?$/, "."), { couleur: doux, apres: 4 });

  texte("Planning", { taille: 12, gras: true, couleur: accent });
  /* planning : chaque jour, le matin puis l'après-midi, les patients à la suite */
  const parJour = new Map<string, { t: Transmission; r: Rdv }[]>();
  for (const t of patients) for (const r of t.rdvs) { if (!parJour.has(r.d)) parJour.set(r.d, []); parJour.get(r.d)!.push({ t, r }); }
  const nom = ({ t, r }: { t: Transmission; r: Rdv }) => t.dossier.label + (r.t === "bilan" ? " (bilan)" : "") + (t.bilan?.resume?.region ? " - " + t.bilan.resume.region : "");
  for (const j of [...parJour.keys()].sort()) {
    place(12);
    texte(maj(jourLong(j)), { gras: true, apres: 0.5 });
    const l = parJour.get(j)!.sort((a, b) => rdvKey(a.r).localeCompare(rdvKey(b.r)) || a.t.dossier.label.localeCompare(b.t.dossier.label, "fr"));
    for (const [m, titre] of [["am", "Matin"], ["pm", "Après-midi"], [null, "Sans précision"]] as const) {
      const ici = l.filter(x => demiDe(x.r) === m);
      if (ici.length) texte(`${titre} (${ici.length}) : ${ici.map(nom).join(" ; ")}`, { retrait: 4, apres: 0.5 });
    }
    y += 2;
  }

  /* ---------- une fiche par patient, à la suite (une nouvelle page seulement si le début de la fiche ne tient plus) ---------- */
  doc.addPage(); y = M;
  patients.forEach((t, i) => {
    if (i) { place(60); if (y > M) { doc.setDrawColor(doux).setLineWidth(0.2).line(M, y + 2, M + LARG, y + 2); y += 7; } }
    const r = t.bilan?.resume;
    doc.setFillColor(fondAccent).roundedRect(M, y, LARG, 12, 2, 2, "F");
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(accent).text(propre(t.dossier.label + (t.age != null ? ", " + t.age + " ans" : "")), M + 3, y + 8);
    if (r?.region) doc.setFontSize(11).setTextColor(encre).text(propre(r.region), M + LARG - 3, y + 8, { align: "right" });
    y += 16;
    champ("Rendez-vous", t.rdvs.map(rdvTexte).join(" ; "));
    if (t.avenir) {
      y += 1;
      texte("Prévu pour la suite" + ` (noté le ${frDate(t.avenir.s.date)})`, { gras: true, couleur: accent, apres: 0.3 });
      texte(t.avenir.texte, { apres: 3 });
    }

    texte(r ? `Bilan${r.date_bilan ? " du " + r.date_bilan : ""}` : t.bilan ? "Bilan (pas encore résumé)" : "Bilan", { taille: 12, gras: true, couleur: accent });
    if (r) {
      if (r.coup_oeil) texte(r.coup_oeil, { apres: 2 });
      const chiffres = (r.chiffres || []).filter(c => !/^[âa]ge\b/i.test(c.label));   // l'âge est déjà dans le titre
      if (chiffres.length) champ("Chiffres", chiffres.map(c => `${c.label} ${c.valeur}`).join(" · "));
      for (const s of r.sections || []) if (s.items?.length) champ(s.titre, s.items.join(" ; "));
    } else texte(t.bilan ? "Le résumé du bilan n'a pas encore été fait : voir le bilan complet." : t.rdvs.some(x => x.t === "bilan") ? "Premier bilan prévu pendant la période." : "Pas de bilan dans l'appli.", { couleur: doux });
    y += 2;

    place(30);   // le titre ne reste pas seul en bas de page
    texte("Séances", { taille: 12, gras: true, couleur: accent });
    if (!t.seances.length) texte("Aucune séance notée.", { couleur: doux });
    else {
      const premiere = t.seances[t.seances.length - 1];
      texte(`${t.seances.length} séance${t.seances.length > 1 ? "s" : ""} notée${t.seances.length > 1 ? "s" : ""} depuis le ${frDate(premiere.date)}.`, { couleur: doux, apres: 2 });
      t.seances.slice(0, 2).forEach((s, i) => {
        place(14);
        texte(`${i ? "Séance précédente" : "Dernière séance"}, le ${frDate(s.date)}`, { gras: true, apres: 0.5 });
        for (const l of texteDe(s).split("\n").filter(x => x.trim())) texte(l, { retrait: 3, apres: 0.5 });
        y += 2;
      });
    }
    y += 4;
  });

  /* pied de page : numéro de page et rappel de confidentialité */
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(doux);
    doc.text(propre("Données de santé confidentielles · usage réservé au remplaçant"), M, H - 8);
    doc.text(`${p} / ${n}`, L - M, H - 8, { align: "right" });
  }
  return doc.output("blob");
}

export const nomFichier = (du: string, au: string) => `Transmissions du ${frDate(du).slice(0, 5).replace("/", "-")} au ${frDate(au).slice(0, 5).replace("/", "-")}.pdf`;
