/* Écran du relevé (2.2.0, Muninn Suivi étape 1, choix de Corentin du 22 novembre 2026) :
   - sous chaque séance, la ligne « Relevé dans cette séance » (toujours visible, choix de Corentin pendant l'essai) ;
   - au toucher d'un relevé : la phrase dite, « C'est juste », « Corriger », « Enlever » ; une correction est gardée
     et rappelée à l'IA comme exemple pour les séances suivantes ;
   - dans la ligne « Suivi » de la fiche : les pastilles des exercices à la maison (fait, en partie, pas fait) et l'observance ;
   - dans les Réglages : « Remplir le suivi » pour les séances du dernier mois notées avant le relevé. */
import * as db from "./db";
import * as moteur from "./moteur";
import { critere, EXO_FR, exercicesDe, observance, relevesDe, sensReleve, valeurReleve, corriger } from "./releves";
import { jourCourt, type Releve, type Seance } from "./regles";
import { esc, toast } from "./ui";

const pastille = (ex: Releve["ex"], detail = false) =>
  `<span class="pas p-${ex}" aria-hidden="true">${detail ? `<i class="pdet"></i>` : ""}</span>`;

/* la ligne sous une séance */
export function ligne(s: Seance): string {
  const rel = relevesDe(s);
  if (!rel.length) return "";
  return `<div class="releves"><div class="relt"><span>Relevé dans cette séance</span><small>touchez pour vérifier ou corriger</small></div><div class="rell">${rel.map((r, i) => {
    const sens = sensReleve(r);
    return `<button class="rel${r.ok ? " ok" : ""}" data-rel="${esc(s.id)}" data-ri="${i}">${esc(critere(r.c).nom)} ${r.ex ? pastille(r.ex) : ""}<b>${esc(valeurReleve(r))}</b>${sens ? ` <span class="rs">· ${esc(sens)}</span>` : ""}${r.ok ? ` <span class="relok" aria-label="vérifié">✓</span>` : ""}</button>`;
  }).join("")}</div></div>`;
}

/* les exercices à la maison dans la ligne « Suivi » de la fiche (8 dernières séances où ils sont dits) */
export function exercices(dossierId: string, seances: Seance[]): string {
  const l = exercicesDe(dossierId, seances);
  if (!l.length) return "";
  const obs = observance(l);
  return `<div class="suiviexo"><div class="e">Exercices</div><div class="l">${l.slice(-8).map(e =>
    `<button class="pasbtn" data-rel="${esc(e.seanceId)}" data-ri="${e.i}" aria-label="${esc(jourCourt(e.date) + " : " + EXO_FR[e.ex])}" title="${esc(jourCourt(e.date))}">${pastille(e.ex, !!e.detail)}</button>`).join("")}</div>${obs != null ? `<small>observance ${obs} %</small>` : ""}</div>`;
}

/* toucher d'un relevé (ligne de la séance ou pastille) : la fenêtre de vérification */
export function brancher(racine: HTMLElement) {
  racine.querySelectorAll<HTMLButtonElement>("[data-rel]").forEach(b => b.onclick = () => ouvrir(b.dataset.rel!, Number(b.dataset.ri)));
}

async function ouvrir(seanceId: string, i: number) {
  const s = (await db.tout()).seances.find(x => x.id === seanceId);
  const r = s && relevesDe(s)[i];
  if (!s || !r) return;
  const d = document.createElement("dialog");
  d.className = "reldlg";
  const val = valeurReleve(r), sens = sensReleve(r);
  d.innerHTML = `<h3>${esc(critere(r.c).nom)} : ${r.ex ? pastille(r.ex) + " " : ""}${esc(val)}${sens ? ` <span class="rs">· ${esc(sens)}</span>` : ""}</h3>
    <p class="note">Séance du ${esc(jourCourt(s.date))} · ce que vous avez dit :</p>
    <blockquote>« ${esc(r.phrase)} »</blockquote>
    ${r.detail ? `<p>Réalisation : <b>${esc(r.detail)}</b></p>` : ""}
    <div class="relcorr" hidden><label for="relval">Valeur juste</label><input id="relval" value="${esc(val)}" autocomplete="off">
      <p class="note">${r.c === "exercices" ? "« fait », « en partie » ou « pas fait »." : "Un chiffre (« 5/10 », « 130° », « 32 mm ») ou des mots (« mieux », « pareil », « dort mieux »)."}</p></div>
    <div class="row"><button class="primary" data-a="ok">C'est juste</button><button data-a="corr">Corriger</button><button data-a="enl">Enlever</button><button data-a="fermer">Fermer</button></div>`;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  const zone = d.querySelector<HTMLElement>(".relcorr")!, champ = d.querySelector<HTMLInputElement>("#relval")!;
  const bOk = d.querySelector<HTMLButtonElement>("[data-a=ok]")!, bCorr = d.querySelector<HTMLButtonElement>("[data-a=corr]")!;
  const ecrire = async (nouveau: Releve | null, apres: string) => {
    const actuelle = (await db.tout()).seances.find(x => x.id === seanceId);
    const liste = actuelle ? relevesDe(actuelle) : [];
    if (!actuelle || !liste[i] || liste[i].phrase !== r.phrase) { toast("Cette séance a changé entre-temps."); d.close(); return; }
    const releves = nouveau ? liste.map((x, k) => k === i ? nouveau : x) : liste.filter((_, k) => k !== i);
    const corr = apres === val ? actuelle.releves_corr ?? [] : [...(actuelle.releves_corr ?? []), { phrase: r.phrase, avant: critere(r.c).nom + " " + val, apres }].slice(-5);
    await db.majSeance(seanceId, { releves, releves_main: true, releves_corr: corr });
    d.close();
    toast(nouveau ? (apres === val ? "Relevé vérifié." : "Relevé corrigé : l'IA s'en servira comme exemple.") : "Relevé enlevé.");
  };
  bOk.onclick = async () => {
    if (zone.hidden) return ecrire({ ...r, ok: true }, val);
    const n = corriger(r, champ.value);
    if (!n) { toast(r.c === "exercices" ? "Écrivez « fait », « en partie » ou « pas fait »." : "Je n'ai pas compris cette valeur."); champ.focus(); return; }
    await ecrire(n, critere(n.c).nom + " " + valeurReleve(n) + (sensReleve(n) ? " (" + sensReleve(n) + ")" : ""));
  };
  bCorr.onclick = () => { zone.hidden = false; bCorr.hidden = true; bOk.textContent = "Enregistrer"; champ.focus(); champ.select(); };
  d.querySelector<HTMLButtonElement>("[data-a=enl]")!.onclick = () => ecrire(null, "(rien à relever)");
  d.querySelector<HTMLButtonElement>("[data-a=fermer]")!.onclick = () => d.close();
  d.showModal();
}

/* ---------- Réglages : remplir le suivi des séances notées avant le relevé ---------- */
let enCours = "";
export async function rattrapage(zone: HTMLElement) {
  if (enCours) { zone.insertAdjacentHTML("afterbegin", `<fieldset class="regligne"><legend>Suivi des patients</legend><p class="note" aria-live="polite">${esc(enCours)}</p></fieldset>`); return; }
  const n = (await moteur.aRemplirSuivi()).length;
  if (!n) return;
  zone.insertAdjacentHTML("afterbegin", `<fieldset class="regligne" id="suivirattrapage"><legend>Suivi des patients</legend>
    <p class="note">${n === 1 ? "Une séance du dernier mois a été notée" : n + " séances du dernier mois ont été notées"} avant le relevé du suivi. Muninn peut les relire d'un coup pour remplir les courbes et les exercices : une demande légère par patient. Cela utilise un peu de votre abonnement Claude.</p>
    <div class="row"><button class="primary" id="suivigo">Remplir le suivi</button></div><p class="note" id="suivietat" aria-live="polite"></p></fieldset>`);
  const go = zone.querySelector<HTMLButtonElement>("#suivigo")!, etat = zone.querySelector<HTMLElement>("#suivietat")!;
  go.onclick = async () => {
    go.disabled = true;
    enCours = "Remplissage du suivi en cours…";
    const r = await moteur.remplirSuivi(x => { enCours = etat.textContent = `En cours : ${x.faits} patient${x.faits > 1 ? "s" : ""} sur ${x.total}…${x.erreurs ? ` (${x.erreurs} à reprendre)` : ""} Vous pouvez continuer à utiliser l'appli ; gardez-la ouverte.`; });
    enCours = "";
    if (!r) { go.disabled = false; etat.textContent = "L'IA n'est pas réglée : voyez « État de l'appli »."; return; }
    etat.textContent = `Terminé : ${r.faits} patient${r.faits > 1 ? "s" : ""} relu${r.faits > 1 ? "s" : ""}.${r.erreurs ? ` ${r.erreurs} n'ont pas abouti : touchez de nouveau le bouton pour les reprendre.` : ""}`;
    go.disabled = !r.erreurs;
    toast("Suivi rempli.");
  };
}
