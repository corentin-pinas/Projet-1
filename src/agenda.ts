/* Agenda : la semaine en colonnes, avec les rendez-vous notés dans l'appli (séance 20 min, bilan 40 min)
   et les créneaux libres en orange, d'après les horaires habituels de Corentin.
   Toucher un patient ouvre sa fiche ; toucher un créneau libre permet d'y placer un patient, ou d'en créer un (bilan à venir). */
import * as db from "./db";
import {
  avecRdv, creneauxLibres, decalerJours, dureeRdv, heureFr, hhmm, HORAIRES_DEFAUT, isoDay, minutes, numeroJour,
  patientFrom, rdvsDuJour, semaine, type Dossier, type Horaires, type Plage
} from "./regles";
import * as transmissions from "./transmissions";
import { confirmer, esc, toast } from "./ui";

const PARAM_HORAIRES = "horaires";
const PX = 1.6;   // pixels par minute : une séance de 20 minutes fait 32 px de haut

let lundi = semaine(isoDay(new Date()))[0];
let horaires: Horaires = HORAIRES_DEFAUT;
let vue: HTMLElement | null = null;
let ouvrirFiche: (id: string) => void = () => {};
let arret: (() => void) | null = null;

const JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const jourCourt = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${JOURS[numeroJour(iso)].slice(0, 3)}. ${d}/${String(m).padStart(2, "0")}`; };
const jourLong = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
const maintenant = () => { const n = new Date(); return { jour: isoDay(n), min: n.getHours() * 60 + n.getMinutes() }; };

export async function ouvrir(surPatient: (id: string) => void) {
  ouvrirFiche = surPatient;
  horaires = (await db.lireParametre<Horaires>(PARAM_HORAIRES).catch(() => undefined)) ?? HORAIRES_DEFAUT;
  lundi = semaine(isoDay(new Date()))[0];
  vue?.remove();
  vue = document.createElement("div");
  vue.className = "agenda";
  vue.setAttribute("role", "dialog");
  vue.setAttribute("aria-label", "Agenda");
  document.body.append(vue);
  arret = db.abonner(() => { afficher(); });
  await afficher();
}

export function fermer() { arret?.(); arret = null; vue?.remove(); vue = null; }

async function afficher() {
  const v = vue;
  if (!v) return;
  const { dossiers } = await db.tout();
  const jours = semaine(lundi);
  const n = maintenant();
  const parJour = jours.map(j => {
    const rdvs = rdvsDuJour(dossiers, j);
    const plages = horaires[String(numeroJour(j))] ?? [];
    const occupes = rdvs.filter(r => r.debut != null).map(r => ({ debut: r.debut!, fin: r.fin! }));
    const libres = creneauxLibres(plages, occupes).filter(c => j > n.jour || (j === n.jour && c.debut >= n.min));
    return { j, rdvs, plages, libres };
  });
  /* hauteur de la grille : des horaires habituels, élargie aux rendez-vous posés en dehors */
  const bornes = parJour.flatMap(p => [...p.plages.flatMap(([a, b]) => [minutes(a), minutes(b)]), ...p.rdvs.flatMap(r => r.debut == null ? [] : [r.debut, r.fin!])]);
  const debut = Math.floor(Math.min(8 * 60, ...bornes) / 60) * 60, fin = Math.ceil(Math.max(19 * 60, ...bornes) / 60) * 60;
  const y = (m: number) => (m - debut) * PX;
  const heures = Array.from({ length: (fin - debut) / 60 }, (_, i) => debut + i * 60);

  const colonnes = parJour.map(p => {
    /* rendez-vous qui se chevauchent : côte à côte */
    const voies: number[] = [];
    const places = p.rdvs.filter(r => r.debut != null).map(r => {
      let k = voies.findIndex(f => f <= r.debut!);
      if (k < 0) { k = voies.length; voies.push(0); }
      voies[k] = r.fin!;
      return { r, k };
    });
    const largeur = 100 / Math.max(1, voies.length);
    const fond = p.plages.map(([a, b]) => `<div class="plage" style="top:${y(minutes(a))}px;height:${(minutes(b) - minutes(a)) * PX}px"></div>`).join("");
    const libres = p.libres.map(c => `<button class="libre" data-jour="${p.j}" data-min="${c.debut}" style="top:${y(c.debut)}px;height:${PX * (c.fin - c.debut)}px" aria-label="Créneau libre ${esc(jourLong(p.j))} à ${esc(heureFr(hhmm(c.debut)))}">${esc(heureFr(hhmm(c.debut)))}</button>`).join("");
    const rdvs = places.map(({ r, k }) => `<button class="rdvb${r.rdv.t === "bilan" ? " bilan" : ""}" data-patient="${esc(r.dossier.id)}" style="top:${y(r.debut!)}px;height:${dureeRdv(r.rdv) * PX}px;left:${k * largeur}%;width:${largeur}%">
        <b>${esc(r.dossier.label)}</b><small>${esc(heureFr(r.rdv.h))}${r.rdv.t === "bilan" ? " · bilan" : ""}</small></button>`).join("");
    const sansHeure = p.rdvs.filter(r => r.debut == null);
    return `<div class="jour${p.j === n.jour ? " auj" : ""}">
      <div class="entete"><b>${esc(jourCourt(p.j))}</b>
        <small>${p.rdvs.length} rdv${p.libres.length ? ` · <span class="trous">${p.libres.length} libre${p.libres.length > 1 ? "s" : ""}</span>` : ""}</small>
        ${sansHeure.map(r => `<button class="rdvb sansheure" data-patient="${esc(r.dossier.id)}"><b>${esc(r.dossier.label)}</b><small>sans heure</small></button>`).join("")}
      </div>
      <div class="col" style="height:${(fin - debut) * PX}px">${fond}${libres}${rdvs}</div>
    </div>`;
  }).join("");

  const [, m1, d1] = jours[0].split("-").map(Number);
  v.innerHTML = `<div class="abar">
      <h2>Semaine du ${d1} ${new Date(2000, m1 - 1, 1).toLocaleDateString("fr-FR", { month: "long" })}</h2>
      <div class="row">
        <button id="aprec" aria-label="Semaine précédente">‹</button>
        <button id="aauj">Cette semaine</button>
        <button id="asuiv" aria-label="Semaine suivante">›</button>
        <button id="ahor">Mes horaires</button>
        <button id="atrans">Transmissions</button>
        <button class="primary" id="afermer">Fermer</button>
      </div>
    </div>
    <p class="note alegende">Touchez un patient pour ouvrir sa fiche, un créneau <span class="trous">orange</span> pour y placer un patient.</p>
    <div class="agrille">
      <div class="heures"><div class="entete"></div><div class="col" style="height:${(fin - debut) * PX}px">${heures.map(h => `<span style="top:${y(h)}px">${h / 60} h</span>`).join("")}</div></div>
      ${colonnes}
    </div>`;

  v.querySelector<HTMLElement>("#afermer")!.onclick = fermer;
  v.querySelector<HTMLElement>("#aprec")!.onclick = () => { lundi = decalerJours(lundi, -7); afficher(); };
  v.querySelector<HTMLElement>("#asuiv")!.onclick = () => { lundi = decalerJours(lundi, 7); afficher(); };
  v.querySelector<HTMLElement>("#aauj")!.onclick = () => { lundi = semaine(isoDay(new Date()))[0]; afficher(); };
  v.querySelector<HTMLElement>("#ahor")!.onclick = editerHoraires;
  v.querySelector<HTMLElement>("#atrans")!.onclick = () => { fermer(); transmissions.ouvrir(); };
  v.querySelectorAll<HTMLElement>("[data-patient]").forEach(b => b.onclick = () => { const id = b.dataset.patient!; fermer(); ouvrirFiche(id); });
  v.querySelectorAll<HTMLElement>(".libre").forEach(b => b.onclick = () => placer(b.dataset.jour!, +b.dataset.min!, dossiers));
}

/* ---------- placer un patient dans un créneau libre ---------- */

function placer(jour: string, min: number, dossiers: Dossier[]) {
  const d = document.createElement("dialog");
  d.className = "placer";
  const heure = hhmm(min);
  const sansRdv = dossiers.filter(x => !x.rdvs.some(r => r.d >= isoDay(new Date()))).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const titre = jourLong(jour);
  d.innerHTML = `<h3>${esc(titre.charAt(0).toUpperCase() + titre.slice(1))} à ${esc(heureFr(heure))}</h3>
    <div class="choix-type" role="radiogroup" aria-label="Type de rendez-vous">
      <label class="choix"><input type="radio" name="ptype" value="seance" checked> Séance (20 min)</label>
      <label class="choix"><input type="radio" name="ptype" value="bilan"> Bilan (40 min)</label>
    </div>
    <input type="search" id="pq" placeholder="Prénom et initiale du patient" aria-label="Patient" autocomplete="off">
    <div class="presultats" id="pres"></div>
    <div class="row"><button id="pannuler">Annuler</button></div>`;
  document.body.append(d);
  d.showModal();
  const q = d.querySelector<HTMLInputElement>("#pq")!, res = d.querySelector<HTMLElement>("#pres")!;
  const type = () => d.querySelector<HTMLInputElement>('input[name="ptype"]:checked')?.value === "bilan" ? "bilan" as const : "seance" as const;
  const montrer = () => {
    const t = q.value.trim().toLowerCase();
    const trouves = t ? dossiers.filter(x => x.label.toLowerCase().includes(t)).sort((a, b) => a.label.localeCompare(b.label, "fr")) : sansRdv;
    const nom = t.includes(" ") ? patientFrom(q.value.trim()) : "";
    const exact = dossiers.some(x => x.label === nom);
    res.innerHTML = (t ? "" : sansRdv.length ? `<p class="note">Patients sans rendez-vous à venir :</p>` : "") +
      trouves.slice(0, 8).map(x => `<button class="cand" data-id="${esc(x.id)}">${esc(x.label)}</button>`).join("") +
      (nom && !exact ? `<button class="creer" id="pnouveau">Nouveau patient « ${esc(nom)} » (bilan à venir)</button>` : "") +
      (t && !trouves.length && !nom ? `<p class="note">Aucun patient à ce nom. Pour en créer un, écrivez le prénom et l'initiale (« Paul G. »).</p>` : "");
    res.querySelectorAll<HTMLElement>("[data-id]").forEach(b => b.onclick = () => poser(dossiers.find(x => x.id === b.dataset.id)!));
    const nv = res.querySelector<HTMLElement>("#pnouveau");
    if (nv) nv.onclick = async () => {
      try { poser(await db.creerPatient(nom), true); }
      catch { toast("Un patient porte déjà ce nom. Ajoutez la 2e lettre du nom de famille (« Paul Ga. »)."); }
    };
  };
  const poser = async (x: Dossier, nouveau = false) => {
    const deja = x.rdvs.find(r => r.d === jour);
    if (deja && !await confirmer(`${x.label} a déjà rendez-vous ce jour-là${deja.h ? " à " + heureFr(deja.h) : ""}. Le déplacer à ${heureFr(heure)} ?`, "Déplacer")) return;
    try {
      await db.setRdvs(x.id, avecRdv(x.rdvs, jour, heure, type()));
      d.close();
      toast(`${x.label} : ${type() === "bilan" ? "bilan" : "séance"} ${jourLong(jour)} à ${heureFr(heure)}.` + (nouveau ? " Patient créé, bilan à venir." : ""));
    } catch { toast("L'enregistrement a échoué. Réessayez."); }
  };
  q.oninput = montrer;
  montrer();
  d.querySelector<HTMLElement>("#pannuler")!.onclick = () => d.close();
  d.addEventListener("close", () => d.remove());
}

/* ---------- horaires habituels ---------- */

function editerHoraires() {
  const d = document.createElement("dialog");
  d.className = "placer horaires";
  const ligne = (n: number) => {
    const p = horaires[String(n)] ?? [];
    const [matin, aprem] = [p[0] ?? ["", ""], p[1] ?? ["", ""]];
    return `<div class="hligne" data-n="${n}">
      <label class="choix"><input type="checkbox" data-travail${p.length ? " checked" : ""}> ${JOURS[n]}</label>
      <span>Matin <input type="time" data-i="0" value="${matin[0]}" aria-label="${JOURS[n]} matin début"> – <input type="time" data-i="1" value="${matin[1]}" aria-label="${JOURS[n]} matin fin"></span>
      <span>Après-midi <input type="time" data-i="2" value="${aprem[0]}" aria-label="${JOURS[n]} après-midi début"> – <input type="time" data-i="3" value="${aprem[1]}" aria-label="${JOURS[n]} après-midi fin"></span>
    </div>`;
  };
  d.innerHTML = `<h3>Mes horaires habituels</h3>
    <p class="note">Ils servent à repérer les créneaux libres (en orange). La pause de midi est l'intervalle entre le matin et l'après-midi.</p>
    ${[1, 2, 3, 4, 5, 6].map(ligne).join("")}
    <div class="row"><button class="primary" id="hok">Enregistrer</button><button id="hannuler">Annuler</button></div>`;
  document.body.append(d);
  d.showModal();
  d.querySelector<HTMLElement>("#hannuler")!.onclick = () => d.close();
  d.querySelector<HTMLElement>("#hok")!.onclick = async () => {
    const nouveaux: Horaires = {};
    for (const l of d.querySelectorAll<HTMLElement>(".hligne")) {
      const n = l.dataset.n!, t = [...l.querySelectorAll<HTMLInputElement>("input[type=time]")].map(i => i.value);
      const plages: Plage[] = [];
      if (l.querySelector<HTMLInputElement>("[data-travail]")!.checked) {
        for (const [a, b] of [[t[0], t[1]], [t[2], t[3]]]) {
          if (!a && !b) continue;
          if (!a || !b || a >= b) { toast(`${JOURS[+n]} : vérifiez les heures (début avant la fin).`); return; }
          plages.push([a, b]);
        }
        if (plages.length === 2 && plages[0][1] > plages[1][0]) { toast(`${JOURS[+n]} : l'après-midi commence avant la fin du matin.`); return; }
      }
      nouveaux[n] = plages;
    }
    horaires = nouveaux;
    try { await db.ecrireParametre(PARAM_HORAIRES, horaires); toast("Horaires enregistrés."); } catch { toast("L'enregistrement a échoué."); }
    d.close();
    afficher();
  };
  d.addEventListener("close", () => d.remove());
}
