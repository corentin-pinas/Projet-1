/* Réglages de l'IA, dans « État de l'appli ».
   Mode principal : l'abonnement Claude de Corentin, via Claude Code installé sur le serveur de l'appli.
   Secours : une clé API, verrouillée tant qu'elle n'est pas explicitement autorisée. */
import * as db from "./db";
import { coutDollars, testerCle } from "./ia";
import { configIA } from "./moteur";
import { toast } from "./ui";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const dollars = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

type EtatServeur = { installe: boolean; connecte: boolean; version: string | null; methode: string | null };

let surChangement: () => void = () => {};

async function serveur<T>(chemin: string, methode = "GET", corps?: unknown): Promise<T & { erreur?: string }> {
  const code = await db.lireParametre<string>("code_acces");
  try {
    const r = await fetch(chemin, {
      method: methode,
      headers: { Authorization: "Bearer " + (code || ""), ...(corps ? { "Content-Type": "application/json" } : {}) },
      body: corps ? JSON.stringify(corps) : undefined
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, erreur: j.erreur || `Le serveur a répondu par une erreur (${r.status}).` };
  } catch {
    return { erreur: "Le serveur de l'appli est injoignable. Vérifiez la connexion à internet." } as T & { erreur?: string };
  }
}

/* ---------- affichage ---------- */

export async function afficherIA() {
  const [code, apiOk, mode, cle, ia, c] = await Promise.all([
    db.lireParametre<string>("code_acces"), db.lireParametre<boolean>("api_autorisee"), db.lireParametre<string>("mode_ia"),
    db.lireParametre<string>("cle_ia"), configIA(), db.consoDuMois()
  ]);

  // consommation du mois
  const fait = c.bilans || c.seances
    ? `Ce mois-ci : ${pluriel(c.bilans, "bilan")} et ${pluriel(c.seances, "séance")} traités.`
    : "Rien de traité ce mois-ci.";
  const argent = [
    c.entree || c.sortie ? `Facturé sur la clé API : environ ${dollars(coutDollars(c))}.` : "",
    c.indicatif ? `Sur l'abonnement, l'équivalent serait d'environ ${dollars(c.indicatif)} : ce n'est pas facturé, cela compte dans le quota.` : ""
  ].filter(Boolean).join(" ");
  $("#iaetat").textContent = !ia
    ? "L'IA n'est pas encore réglée."
    : `En service par ${ia.mode === "api" ? "la clé API" : "votre abonnement Claude"}. ${fait} ${argent}`.trim();

  // abonnement
  $("#aboform").hidden = !!code;
  $("#abooubli").hidden = !code;
  $<HTMLInputElement>("#apiok").checked = apiOk === true;
  $("#apibloc").hidden = apiOk !== true;
  $<HTMLInputElement>(`input[name="modeia"][value="${apiOk && mode === "api" ? "api" : "abonnement"}"]`).checked = true;
  $("#iaform").hidden = !!cle;
  $("#iadel").hidden = !cle;
  if (code) await afficherServeur(); else {
    $("#abostatut").textContent = "Saisissez le code d'accès choisi sur Railway (variable CODE_ACCES).";
    $("#aboconnect").hidden = true; $("#abodeco").hidden = true; $("#aboetape").hidden = true;
  }
}

async function afficherServeur() {
  $("#abostatut").textContent = "Vérification du serveur…";
  const e = await serveur<EtatServeur>("/api/ia/etat");
  $("#aboconnect").hidden = true; $("#abodeco").hidden = true;
  if (e.erreur) { $("#abostatut").textContent = e.erreur; return; }
  if (!e.installe) { $("#abostatut").textContent = "Claude Code n'est pas installé sur le serveur."; return; }
  if (!e.connecte) {
    $("#abostatut").textContent = `Claude Code ${e.version ?? ""} est prêt sur le serveur, mais pas encore connecté à votre abonnement.`;
    $("#aboconnect").hidden = false;
    return;
  }
  $("#abostatut").textContent = `Claude Code ${e.version ?? ""} est connecté à votre abonnement Claude.`;
  $("#abodeco").hidden = false;
  $("#aboetape").hidden = true;
}

/* ---------- actions ---------- */

export function brancherReglagesIA(changement: () => void) {
  surChangement = async () => { await afficherIA(); changement(); };

  $("#abosave").addEventListener("click", async () => {
    const code = $<HTMLInputElement>("#abocode").value.trim();
    if (code.length < 12) { toast("Le code d'accès fait au moins 12 caractères."); return; }
    await db.ecrireParametre("code_acces", code);
    const e = await serveur<EtatServeur>("/api/ia/etat");
    if (e.erreur) { await db.ecrireParametre("code_acces", undefined); toast(e.erreur); return; }
    $<HTMLInputElement>("#abocode").value = "";
    toast("Code d'accès accepté par le serveur.");
    surChangement();
  });

  $("#abooubli").addEventListener("click", async () => {
    await db.ecrireParametre("code_acces", undefined);
    toast("Code d'accès oublié sur cette tablette.");
    surChangement();
  });

  $("#aboconnect").addEventListener("click", async () => {
    const btn = $<HTMLButtonElement>("#aboconnect"); btn.disabled = true;
    const r = await serveur<{ lien?: string }>("/api/ia/connexion", "POST");
    btn.disabled = false;
    if (r.erreur || !r.lien) { toast(r.erreur || "Le serveur n'a pas proposé de lien de connexion."); return; }
    $<HTMLAnchorElement>("#abolien").href = r.lien;
    $("#aboetape").hidden = false;
    $("#abocodeco").focus();
  });

  $("#abovalider").addEventListener("click", async () => {
    const code = $<HTMLInputElement>("#abocodeco").value.trim();
    if (!code) { toast("Collez le code affiché après la connexion."); return; }
    const btn = $<HTMLButtonElement>("#abovalider"); btn.disabled = true; btn.textContent = "Connexion…";
    const r = await serveur<{ ok?: boolean }>("/api/ia/connexion/code", "POST", { code });
    btn.disabled = false; btn.textContent = "Valider";
    if (r.erreur) { toast(r.erreur); return; }
    $<HTMLInputElement>("#abocodeco").value = "";
    $("#aboetape").hidden = true;
    toast("Abonnement connecté. Les bilans en attente vont être résumés.");
    surChangement();
  });

  $("#abodeco").addEventListener("click", async () => {
    await serveur("/api/ia/deconnexion", "POST");
    toast("Abonnement déconnecté du serveur.");
    surChangement();
  });

  // secours : clé API
  $("#apiok").addEventListener("change", async () => {
    const ok = $<HTMLInputElement>("#apiok").checked;
    await db.ecrireParametre("api_autorisee", ok || undefined);
    if (!ok) await db.ecrireParametre("mode_ia", undefined);
    toast(ok ? "Clé API autorisée en secours." : "Clé API verrouillée : seul l'abonnement est utilisé.");
    surChangement();
  });
  document.querySelectorAll<HTMLInputElement>('input[name="modeia"]').forEach(r => r.addEventListener("change", async () => {
    await db.ecrireParametre("mode_ia", r.value === "api" ? "api" : undefined);
    toast(r.value === "api" ? "L'IA passe par la clé API (facturée à l'usage)." : "L'IA passe par votre abonnement.");
    surChangement();
  }));

  $("#iasave").addEventListener("click", async () => {
    const cle = $<HTMLInputElement>("#iacle").value.trim();
    if (!/^sk-ant-[\w-]{20,}$/.test(cle)) { toast("Cette clé ne ressemble pas à une clé Anthropic : elle commence par sk-ant-."); return; }
    const btn = $<HTMLButtonElement>("#iasave"); btn.disabled = true; btn.textContent = "Vérification…";
    const erreur = await testerCle(cle);
    btn.disabled = false; btn.textContent = "Enregistrer la clé";
    if (erreur) { toast(erreur); return; }
    await db.ecrireParametre("cle_ia", cle);
    $<HTMLInputElement>("#iacle").value = "";
    toast("Clé vérifiée et enregistrée.");
    surChangement();
  });

  $("#iadel").addEventListener("click", async () => {
    await db.ecrireParametre("cle_ia", undefined);
    toast("Clé retirée de cette tablette.");
    surChangement();
  });
}
