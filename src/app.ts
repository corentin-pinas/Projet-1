/* Écrans de l'appli : liste des patients et fiche (bilan, rendez-vous, séances).
   Reprise de la version d'essai ; l'IA (résumés, mise au propre) arrive à l'étape 3. */
import * as db from "./db";
import {
  ageOf, avecRdv, avenirDe, avenirFrom, frDate, heureFr, isoDay, jourLabel, lignesListe, nomAffiche,
  prochainRdv, propreOk, questionHomonyme, rdvsAVenir, texteDe, trierBilans, trierSeances,
  type Bilan, type Dossier, type Seance
} from "./regles";
import * as moteur from "./moteur";
import { confirmer, esc, toast } from "./ui";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

let donnees: db.Donnees = { dossiers: [], bilans: [], seances: [] };
let selected: string | null = null;      // bilan affiché
let formOpen = false, editing: string | null = null, rdvOpen = false, homoOpen = false;
const busy = () => formOpen || !!editing || rdvOpen || homoOpen;
let aCle = false;                         // une clé d'IA est enregistrée

const aujourdhui = () => isoDay(new Date());
const RUBRIQUES = ["État du patient", "Fait en séance", "À faire à la maison", "Autres notes", "À venir"];
const fmtSeance = (t: string) => esc(t).replace(new RegExp("^(" + RUBRIQUES.join("|") + ") ?:", "gm"), "<b>$1 :</b>");

const dossierDe = (b: Bilan) => donnees.dossiers.find(d => d.id === b.dossierId)!;
const bilansDe = (d: Dossier) => trierBilans(donnees.bilans.filter(b => b.dossierId === d.id));
const seancesDe = (d: Dossier) => trierSeances(donnees.seances.filter(s => s.dossierId === d.id));
const ageDe = (d: Dossier) => bilansDe(d).map(ageOf).find(a => a != null) ?? null;

export async function demarrer() {
  donnees = await db.tout();
  db.abonner(async () => {
    donnees = await db.tout();
    if (selected && !donnees.bilans.some(b => b.id === selected)) selected = null;
    renderList();
    if (!busy()) renderMain();
  });
  moteur.abonner(() => { renderList(); if (!busy()) renderMain(); });
  moteur.surMessage(toast);
  addEventListener("online", () => moteur.resumerEnAttente());
  await rafraichirIA();
  $("#add").addEventListener("click", () => $("#file").click());
  $<HTMLInputElement>("#file").addEventListener("change", ajouter);
  $("#q").addEventListener("input", renderList);
  /* la liste se reclasse quand on revient sur l'appli (le jour a pu changer) */
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { renderList(); if (selected && !busy()) renderMain(); } });
  renderList();
  renderMain();
}

/* à appeler quand les réglages de l'IA changent : relance les résumés en attente */
export async function rafraichirIA() {
  aCle = !!(await moteur.configIA());
  renderList(); if (!busy()) renderMain();
  moteur.resumerEnAttente();
}

function etatResume(bilans: Bilan[]) {
  if (bilans.some(x => moteur.occupe(x.id))) return `<span class="pending">Résumé en cours…</span>`;
  if (bilans.some(x => !x.resume && x.resume_erreur)) return `<span class="pending">Résumé à refaire</span>`;
  return `<span class="pending">En attente de résumé</span>`;
}

/* ---------- liste ---------- */

function renderList() {
  const t = aujourdhui();
  const lignes = lignesListe(donnees.dossiers, donnees.bilans, $<HTMLInputElement>("#q").value, t);
  if (!donnees.dossiers.length) { $("#list").innerHTML = `<div class="note">Aucun bilan pour l'instant.</div>`; return; }
  if (!lignes.length) { $("#list").innerHTML = `<div class="note">Aucun patient ne correspond.</div>`; return; }
  let grp: string | null = null;
  $("#list").innerHTML = lignes.map(({ dossier: d, bilans, age, rdv }) => {
    const b = bilans[0], r = b?.resume;
    const sub = r ? [r.region, r.date_bilan].filter(Boolean).join(", ") : "";
    const g = rdv ? rdv.date : "";
    let head = "";
    if (g !== grp) { grp = g; head = `<div class="grp${g === t ? " now" : ""}">${g ? esc(jourLabel(g, new Date())) : "Sans rendez-vous prévu"}</div>`; }
    const cur = bilans.some(x => x.id === selected);
    const n = donnees.seances.filter(s => s.dossierId === d.id).length;
    const ask = !!questionHomonyme(d, donnees.dossiers, donnees.bilans);
    return head + `<button class="item${g === t ? " now" : ""}" data-id="${esc(cur ? selected! : b?.id ?? "")}" aria-current="${cur}">
      <b>${rdv?.heure ? `<i class="hr">${esc(heureFr(rdv.heure))}</i>` : ""}${esc(nomAffiche(d, age, donnees.dossiers))}${ask ? `<i class="ask" title="Même personne qu'un autre dossier ?" aria-label="Question : même personne qu'un autre dossier ?">?</i>` : ""}</b>${n ? `<span>${n} séance${n > 1 ? "s" : ""}</span><br>` : ""}${bilans.length > 1 ? `<span>${bilans.length} bilans</span><br>` : ""}${bilans.some(x => !x.resume) ? etatResume(bilans.filter(x => !x.resume)) : `<span>${esc(sub || "Bilan")}</span>`}</button>`;
  }).join("");
  $("#list").querySelectorAll<HTMLElement>(".item").forEach(el => el.onclick = () => {
    selected = el.dataset.id || null; formOpen = false; editing = null; rdvOpen = false; homoOpen = false;
    renderList(); renderMain();
    if (matchMedia("(max-width:820px)").matches) $("#main").scrollIntoView({ behavior: "smooth" });
  });
}

/* ---------- fiche ---------- */

export function renderMain() {
  const b = donnees.bilans.find(x => x.id === selected);
  if (!b) { $("#main").innerHTML = `<div class="empty">Choisissez un patient dans la liste, ou ajoutez un bilan.</div>`; return; }
  const r = b.resume, D = dossierDe(b), age = ageDe(D), bilans = bilansDe(D);
  const meta = [age != null ? age + " ans" : "", ...(r ? [r.region, r.date_bilan && "bilan du " + r.date_bilan] : [b.fichier])].filter(Boolean).join(", ");
  let html = `<div class="head"><div><h2>${esc(D.label)}</h2><div class="meta">${esc(meta)}</div></div>${!formOpen && !editing ? `<button class="primary dict" id="dict">Dicter la séance</button>` : ""}</div>`;

  const autre = questionHomonyme(D, donnees.dossiers, donnees.bilans);
  if (autre) {
    const ob = bilansDe(autre)[0]?.resume, oa = ageDe(autre);
    html += `<div class="check" id="hbox"><b>Même personne ?</b>
      <p style="color:var(--ink);margin:6px 0 10px">Un autre dossier porte le même prénom et la même initiale${age != null && oa != null ? ", avec un âge qui correspond" : ""} : <b>${esc(autre.label)}${oa != null ? ", " + oa + " ans" : ""}</b>${ob ? esc(" (" + [ob.region, ob.date_bilan && "bilan du " + ob.date_bilan].filter(Boolean).join(", ") + ")") : ""}. Ce nouveau bilan concerne-t-il la même personne ?</p>
      <div class="vbtns"><button class="ok" id="hyes">Oui, même personne</button><button id="hno">Non, deux personnes différentes</button></div></div>`;
  }

  const rv = prochainRdv(D.rdvs, aujourdhui());
  html += rdvOpen ? `<div class="sform" style="margin-top:12px">
      <label for="rdate">Date du prochain rendez-vous</label><input type="date" id="rdate" value="${esc(rv ? rv.date : aujourdhui())}">
      <label for="rtime">Heure</label><input type="time" id="rtime" value="${esc(rv ? rv.heure : "")}">
      <div class="row"><button class="primary" id="rsave">Enregistrer</button>${rv ? `<button id="rclear">Effacer le rendez-vous</button>` : ""}<button id="rcancel">Annuler</button></div></div>`
    : `<div class="rdv"><span>${rv ? `Prochain rendez-vous : <b>${esc(jourLabel(rv.date, new Date()).toLowerCase() + (rv.heure ? " à " + heureFr(rv.heure) : ""))}</b>${rv.autres ? ` <span class="meta">(+ ${rv.autres} autre${rv.autres > 1 ? "s" : ""} ensuite)</span>` : ""}` : `<span class="meta">Aucun rendez-vous prévu</span>`}</span><button id="rbtn">${rv ? "Modifier" : "Ajouter un rendez-vous"}</button></div>`;

  const av = avenirDe(seancesDe(D));
  if (av) html += `<div class="avenir"><b>À venir :</b> <span class="${av.resume ? "" : "clamp"}">${esc(av.texte)}</span>
    <div class="avmeta"><span>Noté à la séance du ${esc(frDate(av.s.date))}</span>${!av.resume && aCle ? `<button id="avsum"${moteur.occupe(av.s.id) ? " disabled" : ""}>${moteur.occupe(av.s.id) ? "Reformulation…" : "Reformuler en bref"}</button>` : ""}</div></div>`;

  if (bilans.length > 1) html += `<div class="bils" role="group" aria-label="Bilans de ce dossier">${bilans.map(x => `<button data-bil="${esc(x.id)}" aria-pressed="${x.id === b.id}">${esc(x.resume ? ["Bilan du " + (x.resume.date_bilan || frDate(x.ajoute.slice(0, 10))), x.resume.region].filter(Boolean).join(", ") : "Bilan du " + frDate(x.ajoute.slice(0, 10)) + ", en attente de résumé")}</button>`).join("")}</div>`;

  if (!r) {
    html += moteur.occupe(b.id)
      ? `<div class="wait encours">Résumé en cours… L'IA lit le bilan, cela prend en général moins d'une minute.</div>`
      : !aCle
        ? `<div class="wait">Ce bilan n'est pas encore résumé. Pour que les résumés se fassent tout seuls, réglez l'IA dans « État de l'appli », en bas de la liste.</div>`
        : b.resume_erreur
          ? `<div class="wait">Le résumé n'a pas abouti : ${esc(b.resume_erreur)}<div class="row" style="margin-top:10px"><button class="primary" id="resum">Réessayer le résumé</button></div></div>`
          : `<div class="wait">Ce bilan n'est pas encore résumé. Il le sera dès que la tablette sera connectée à internet.<div class="row" style="margin-top:10px"><button id="resum">Résumer maintenant</button></div></div>`;
  } else {
    if (r.coup_oeil) html += `<p class="glance">${esc(r.coup_oeil)}</p>`;
    if (r.chiffres?.length) html += `<div class="chips">${r.chiffres.map(c => `<div class="chip"><small>${esc(c.label)}</small><strong>${esc(c.valeur)}</strong></div>`).join("")}</div>`;
    (r.sections || []).forEach((s, i) => {
      if (!s.items?.length) return;
      html += `<details class="sec"${i < 2 ? " open" : ""}><summary>${esc(s.titre)}</summary><ul>${s.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
    });
    if (r.a_verifier?.length) html += `<div class="check"><b>À vérifier</b><ul class="vlist">${r.a_verifier.map((x, i) => `<li class="vitem" data-i="${i}"><p>${esc(x)}</p>
        <div class="vbtns"><button class="ok" data-act="ok">C'est juste</button><button data-act="fix">Corriger</button></div></li>`).join("")}</ul></div>`;
  }
  html += `<div class="actions"><button class="primary" id="open">Voir le bilan complet</button><button id="del">Supprimer ce bilan</button></div>
    <p class="note" style="margin-top:14px">Fichier : ${esc(b.fichier)}</p>`;
  html += seancesHtml(D);
  $("#main").innerHTML = html;

  wireSeances(D);
  wireRdv(D);
  if (autre) wireHomonyme(D, autre);
  $("#main").querySelectorAll<HTMLElement>("[data-bil]").forEach(el => el.onclick = () => {
    selected = el.dataset.bil!; formOpen = false; editing = null; rdvOpen = false; homoOpen = false; renderList(); renderMain();
  });
  $("#open").onclick = () => ouvrirVisionneuse(b);
  const resum = $("#resum"); if (resum) resum.onclick = () => moteur.resumer(b.id, true);
  const avb = $("#avsum"); if (avb && av) avb.onclick = () => moteur.analyser(av.s, true, false);
  $("#del").onclick = () => supprimer(b);
  $("#main").querySelectorAll<HTMLElement>(".vitem").forEach(li => {
    const i = +li.dataset.i!;
    li.querySelector<HTMLElement>('[data-act="ok"]')!.onclick = () => verifier(b, i, null);
    li.querySelector<HTMLElement>('[data-act="fix"]')!.onclick = () => {
      if (li.querySelector(".vedit")) return;
      const d = document.createElement("div"); d.className = "vedit";
      d.innerHTML = `<input type="text" placeholder="La bonne information" aria-label="Correction"><button class="primary">Enregistrer</button><button>Annuler</button>`;
      li.append(d);
      const inp = d.querySelector("input")!; inp.focus();
      const save = () => { const v = inp.value.trim(); if (v) verifier(b, i, v); else inp.focus(); };
      d.querySelector<HTMLElement>(".primary")!.onclick = save;
      inp.onkeydown = e => { if (e.key === "Enter") save(); };
      d.querySelector<HTMLElement>("button:last-child")!.onclick = () => d.remove();
    };
  });
}

/* réponse à « même personne ? » : oui = on réunit les deux dossiers ; non = on ajoute la 2e lettre du nom au nouveau */
function wireHomonyme(D: Dossier, autre: Dossier) {
  const box = $("#hbox");
  $("#hyes").onclick = async () => {
    $<HTMLButtonElement>("#hyes").disabled = true;
    try { await db.fusionner(D.id, autre.id); toast("Les deux bilans sont réunis dans un seul dossier."); }
    catch { toast("L'enregistrement a échoué. Réessayez."); renderMain(); }
  };
  $("#hno").onclick = () => {
    if (box.querySelector(".vedit")) return;
    homoOpen = true;
    const d = document.createElement("div"); d.className = "vedit";
    d.innerHTML = `<input type="text" maxlength="1" autocapitalize="off" placeholder="2e lettre du nom de famille" aria-label="Deuxième lettre du nom de famille de ce patient"><button class="primary">Enregistrer</button><button>Annuler</button>`;
    box.append(d);
    const inp = d.querySelector("input")!; inp.focus();
    const save = async () => {
      const l = inp.value.trim();
      if (!/^\p{L}$/u.test(l)) { toast("Indiquez une seule lettre."); inp.focus(); return; }
      const label = D.label.replace(/\.$/, "") + l.toLowerCase() + ".";
      homoOpen = false;
      try { await db.renommer(D.id, label); toast("Ce patient s'appelle maintenant " + label); }
      catch { toast("L'enregistrement a échoué. Réessayez."); }
    };
    d.querySelector<HTMLElement>(".primary")!.onclick = save;
    inp.onkeydown = e => { if (e.key === "Enter") save(); };
    d.querySelector<HTMLElement>("button:last-child")!.onclick = () => { homoOpen = false; renderMain(); };
  };
}

/* « Modifier » remplace le prochain rendez-vous, « Effacer » le retire ; les suivants sont gardés */
async function saveRdv(D: Dossier, date: string, heure: string) {
  try {
    const suite = rdvsAVenir(D.rdvs, aujourdhui()).slice(1);
    rdvOpen = false;
    await db.setRdvs(D.id, date ? avecRdv(suite, date, heure) : suite);
    toast(date ? "Rendez-vous enregistré." : "Rendez-vous effacé.");
  } catch {
    rdvOpen = true; toast("L'enregistrement a échoué. Réessayez.");
    const s = $<HTMLButtonElement>("#rsave"); if (s) s.disabled = false;
  }
}

function wireRdv(D: Dossier) {
  const open = $("#rbtn"); if (open) open.onclick = () => { rdvOpen = true; formOpen = false; editing = null; renderMain(); $("#rdate").focus(); };
  const cancel = $("#rcancel"); if (cancel) cancel.onclick = () => { rdvOpen = false; renderMain(); };
  const clear = $("#rclear"); if (clear) clear.onclick = () => saveRdv(D, "", "");
  const save = $<HTMLButtonElement>("#rsave");
  if (save) save.onclick = () => {
    const date = $<HTMLInputElement>("#rdate").value, heure = $<HTMLInputElement>("#rtime").value;
    if (!date) { toast("Indiquez la date du rendez-vous."); return; }
    if (date < aujourdhui()) { toast("Cette date est déjà passée."); return; }
    save.disabled = true; saveRdv(D, date, heure);
  };
}

/* ---------- séances ---------- */

function seancesHtml(D: Dossier) {
  const list = seancesDe(D);
  const ed = editing ? donnees.seances.find(s => s.id === editing) : undefined;
  const form = (formOpen || ed) ? `<div class="sform">
      <label for="sdate">Date de la séance</label><input type="date" id="sdate" value="${esc(ed ? ed.date : aujourdhui())}">
      <label for="stext">Contenu de la séance</label><textarea id="stext" placeholder="Touchez le micro de votre clavier et dictez en vrac : ce que dit le patient, ce qui a été fait, les exercices donnés, puis « Pour la prochaine séance… ». La mise au propre se fait à l'enregistrement.">${esc(ed ? texteDe(ed) : "")}</textarea>
      <div class="note" id="avprev"></div>
      <div class="row"><button class="primary" id="ssave">${ed ? "Enregistrer les modifications" : "Enregistrer la séance"}</button><button id="scancel">Annuler</button></div></div>` : "";
  return `<div class="seances"><h3>Séances (${list.length})${!form ? `<button class="primary" id="sadd">Ajouter une séance</button>` : ""}</h3>${form}
    ${list.length ? list.map((s, k) => {
      const ok = propreOk(s), orig = s.brut || s.contenu;
      return `<div class="seance"><div class="sd">Séance ${list.length - k}, le ${esc(frDate(s.date))}</div><div class="sc">${ok ? fmtSeance(s.propre!) : esc(s.contenu)}</div>
      ${moteur.occupe(s.id) ? `<div class="note">Mise au propre en cours…</div>` : ""}
      ${ok && orig !== s.propre ? `<details class="orig"><summary>Texte d'origine</summary><div class="sc">${esc(orig)}</div></details>` : ""}
      <div class="sa"><button data-edit="${esc(s.id)}">Modifier</button>${!ok && aCle && !moteur.occupe(s.id) ? `<button data-clean="${esc(s.id)}">Mettre au propre</button>` : ""}<button data-sdel="${esc(s.id)}">Supprimer</button></div></div>`;
    }).join("") : (form ? "" : `<p class="note">Aucune séance enregistrée pour ce patient.</p>`)}</div>`;
}

function wireSeances(D: Dossier) {
  const ouvrir = () => {
    formOpen = true; editing = null; rdvOpen = false; renderMain();
    const ta = $("#stext"); ta.scrollIntoView({ block: "center" }); ta.focus();
  };
  const add = $("#sadd"); if (add) add.onclick = ouvrir;
  const dict = $("#dict"); if (dict) dict.onclick = ouvrir;
  const cancel = $("#scancel"); if (cancel) cancel.onclick = () => { formOpen = false; editing = null; renderMain(); };
  const ta = $<HTMLTextAreaElement>("#stext"), prev = $("#avprev");
  if (ta && prev) {
    const show = () => {
      const a = avenirFrom(ta.value);
      prev.textContent = a ? "À venir repéré : " + a : "Ce que vous dictez après « Pour la prochaine séance » s'affichera en haut de la fiche du patient. Si vous y dites quand elle aura lieu (« dans une semaine à 8 heures »), le rendez-vous se place tout seul.";
    };
    ta.oninput = show; show();
  }
  const save = $<HTMLButtonElement>("#ssave");
  if (save) save.onclick = async () => {
    const date = $<HTMLInputElement>("#sdate").value, contenu = $<HTMLTextAreaElement>("#stext").value.trim();
    if (!date) { toast("Indiquez la date de la séance."); return; }
    if (!contenu) { toast("Écrivez le contenu de la séance."); $("#stext").focus(); return; }
    save.disabled = true;
    const avant = editing ? donnees.seances.find(s => s.id === editing) : undefined;
    try {
      if (avant) {
        const garde = propreOk(avant);                 // le texte affiché était déjà mis au propre
        if (contenu === texteDe(avant)) {
          await enregistrerSansBouger(() => db.majSeance(avant.id, { date }));
          if (!avant.ia_ok || avant.date !== date) moteur.analyser({ ...avant, date }, false, garde);
        } else {
          /* correction à la main d'un texte déjà mis au propre : sa version fait foi, la dictée d'origine est conservée */
          const patch: Partial<Seance> = garde
            ? { date, contenu, propre: contenu, propre_source: contenu, brut: avant.brut || avant.contenu, ia_ok: false }
            : { date, contenu, ia_ok: false };
          await enregistrerSansBouger(() => db.majSeance(avant.id, patch));
          moteur.analyser({ ...avant, ...patch }, false, garde);
        }
      } else {
        const s = await enregistrerSansBouger(() => db.ajouterSeance(D.id, date, contenu));
        moteur.analyser(s, false, false);
      }
      toast(avant ? "Séance modifiée." : "Séance enregistrée.");
    } catch { save.disabled = false; toast("L'enregistrement a échoué. Réessayez."); }
  };
  $("#main").querySelectorAll<HTMLElement>("[data-clean]").forEach(el => el.onclick = () => {
    const s = donnees.seances.find(x => x.id === el.dataset.clean); if (s) moteur.analyser(s, true, false);
  });
  $("#main").querySelectorAll<HTMLElement>("[data-edit]").forEach(el => el.onclick = () => {
    editing = el.dataset.edit!; formOpen = false; rdvOpen = false; renderMain(); $("#stext").focus();
  });
  $("#main").querySelectorAll<HTMLElement>("[data-sdel]").forEach(el => el.onclick = async () => {
    if (!await confirmer("Supprimer cette séance ? Cette action est définitive.", "Supprimer la séance")) return;
    try { await db.supprimerSeance(el.dataset.sdel!); toast("Séance supprimée."); } catch { toast("La suppression a échoué."); }
  });
}

/* ferme le formulaire juste avant l'écriture, pour que l'écran se mette à jour avec la séance enregistrée */
async function enregistrerSansBouger<T>(ecrire: () => Promise<T>): Promise<T> {
  const f = formOpen, e = editing;
  formOpen = false; editing = null;
  try { return await ecrire(); } catch (err) { formOpen = f; editing = e; throw err; }
}

/* ---------- ajout, vérification, suppression ---------- */

async function ajouter(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files || [])]; input.value = "";
  if (!files.length) return;
  const pdfs = files.filter(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const imgs = files.filter(f => f.type.startsWith("image/"));
  const groupes = pdfs.map(f => [f]);
  if (imgs.length) groupes.push(imgs);   // les photos choisies ensemble = un seul bilan
  if (!groupes.length) { toast("Choisissez des fichiers PDF ou des photos."); return; }
  const btn = $<HTMLButtonElement>("#add"); btn.disabled = true;
  let ok = 0;
  for (const g of groupes) {
    try {
      if (g.some(f => f.size > 50e6)) { toast(`${g[0].name} est trop lourd (50 Mo maximum).`); continue; }
      const b = await db.ajouterBilan(g);
      selected = b.id; ok++;
    } catch (err) {
      toast((err as DOMException)?.name === "QuotaExceededError" ? "La tablette n'a plus assez de place." : `${g[0].name} n'a pas pu être ajouté.`);
    }
  }
  btn.disabled = false;
  if (ok) {
    formOpen = false; editing = null; rdvOpen = false; homoOpen = false; renderList(); renderMain();
    toast((ok > 1 ? `${ok} bilans ajoutés.` : "Bilan ajouté.") + (aCle && navigator.onLine ? " Le résumé est en cours." : ""));
    moteur.resumerEnAttente();
  }
}

/* valider (correction = null) ou corriger un point à vérifier */
async function verifier(b: Bilan, i: number, correction: string | null) {
  const r = b.resume!, point = r.a_verifier![i];
  const patch: Partial<Bilan> = { resume: { ...r, a_verifier: r.a_verifier!.filter((_, k) => k !== i) } };
  if (correction) patch.corrections = [...b.corrections, { point, correction, quand: new Date().toISOString() }];
  else patch.valides = [...b.valides, point];
  try { await db.majBilan(b.id, patch); toast(correction ? "Correction enregistrée." : "Validé."); }
  catch { toast("L'enregistrement a échoué. Réessayez."); }
}

async function supprimer(b: Bilan) {
  const D = dossierDe(b), seul = bilansDe(D).length === 1, n = seancesDe(D).length;
  const texte = seul
    ? `Supprimer le bilan de ${D.label} ? C'est son seul bilan : le patient disparaît de la liste${n ? `, avec ses ${n} séance${n > 1 ? "s" : ""}` : ""} et ses rendez-vous. Cette action est définitive.`
    : `Supprimer ce bilan de ${D.label} ? Ses autres bilans et ses séances sont gardés. Cette action est définitive.`;
  if (!await confirmer(texte, "Supprimer")) return;
  try { await db.supprimerBilan(b.id); selected = seul ? null : bilansDe(D).find(x => x.id !== b.id)?.id ?? null; renderMain(); toast("Bilan supprimé."); }
  catch { toast("La suppression a échoué."); }
}

/* ---------- visionneuse ---------- */

async function ouvrirVisionneuse(b: Bilan) {
  const v = document.createElement("div"); v.className = "viewer";
  v.innerHTML = `<div class="bar"><b>${esc(dossierDe(b).label)}</b><button id="vclose">Fermer</button></div><div class="pages"><p class="vmsg">Ouverture…</p></div>`;
  document.body.append(v);
  const urls: string[] = [];
  v.querySelector<HTMLElement>("#vclose")!.onclick = () => { urls.forEach(u => URL.revokeObjectURL(u)); v.remove(); };
  const pages = v.querySelector<HTMLElement>(".pages")!;
  try {
    pages.innerHTML = "";
    for (const f of b.fichiers) {
      const blob = await db.fichierBlob(f.id);
      if (!blob) throw new Error("fichier absent");
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.nom)) {
        const { pdfjs } = await import("./pdf");
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const dpr = window.devicePixelRatio || 1;
          const w = Math.min(1000, pages.clientWidth - 32) * dpr;
          const vp = page.getViewport({ scale: w / page.getViewport({ scale: 1 }).width });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
          c.style.width = vp.width / dpr + "px";
          pages.append(c);
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
        }
      } else {
        const u = URL.createObjectURL(blob); urls.push(u);
        const img = document.createElement("img"); img.src = u; img.alt = "Page du bilan"; pages.append(img);
      }
    }
  } catch (err) {
    console.error("Visionneuse :", err);
    pages.innerHTML = `<p class="vmsg">Le bilan n'a pas pu s'afficher.</p>`;
  }
}
