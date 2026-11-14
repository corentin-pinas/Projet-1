/* L'enregistreur de voix, commun à la dictée groupée et à « Enregistrer ma séance » (audit A2 : il était écrit deux fois).
   Micro, chrono, texte en direct, garde de l'enregistrement pas encore transcrit (audit M1), transcription, relances
   automatiques (1.5.1) et boutons. Chaque écran dit seulement où garder la voix et quoi faire du texte transcrit. */
import { ErreurIA } from "./ia";
import { phrase, Relanceur } from "./relance";
import * as voix from "./transcription";
import { confirmer, esc, toast } from "./ui";

export type OptionsEnregistreur = {
  id: string;                                   // préfixe des éléments à l'écran : « v » (dictée), « sv » (séance)
  libelle: string;                              // « Enregistrer ma dictée »
  enTranscription: string;                      // message pendant la transcription
  noms: () => Promise<string[]>;                // patients donnés à Whisper
  garder: (son: Blob) => Promise<void>;         // l'enregistrement pas encore transcrit, gardé dans la base
  oublier: () => Promise<void>;
  transcrit: (texte: string) => void | Promise<void>;
  /* 1.9.0 : l'enregistrement confié tel quel au PC, qui le transcrit et le range en tâche de fond. Rend faux si le PC ne
     prend pas le travail (transcription ici, comme avant) ; une erreur (PC injoignable) : l'enregistrement reste gardé. */
  envoyer?: (son: Blob) => Promise<boolean>;
  redessiner: () => void;
};

const duree = (ms: number) => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

export class Enregistreur {
  dispo = false;                               // Whisper joignable : le bouton apparaît
  enCours: voix.Enregistrement | null = null;   // micro ouvert
  attente: Blob | null = null;                  // enregistré, pas encore transcrit
  travail = false;                              // transcription en cours
  erreur = "";                                  // pourquoi la dernière transcription a échoué
  direct = "";                                  // texte transcrit en direct pendant l'enregistrement
  private noms: string[] = [];
  private chrono: ReturnType<typeof setInterval> | undefined;
  /* relance automatique après un échec (5 min, 3 essais au plus) */
  readonly relance: Relanceur;

  constructor(private o: OptionsEnregistreur) {
    this.relance = new Relanceur(essai => { this.transcrire(undefined, essai); }, () => o.redessiner());
  }

  occupe() { return !!this.enCours || this.travail; }

  verifierDispo() {
    voix.disponible().then(ok => { if (ok !== this.dispo) { this.dispo = ok; this.o.redessiner(); } }).catch(() => {});
  }

  private $ = (n: string) => document.querySelector<HTMLElement>("#" + this.o.id + n);
  private montrerDirect = (t: string) => {
    this.direct = t;
    const el = this.$("direct");
    if (el) { el.textContent = t; el.hidden = !t; el.scrollTop = el.scrollHeight; }
  };

  html(): string {
    const i = this.o.id;
    if (this.enCours) return `<div class="voix enreg" role="status"><span class="point" aria-hidden="true"></span> Enregistrement <span id="${i}chrono">${voix.chrono(this.enCours, duree)}</span>
        <button class="primary" id="${i}arreter">Arrêter et transcrire</button><button id="${i}annuler">Annuler</button></div>
       <div class="direct" id="${i}direct" aria-live="polite" ${this.direct ? "" : "hidden"}>${esc(this.direct)}</div>`;
    if (this.travail) return `<div class="wait encours" role="status">${esc(this.o.enTranscription)}</div>`;
    if (this.attente) return `<div class="wait">Un enregistrement de votre voix est gardé : il n'a pas encore été transcrit.${this.erreur ? `<br><small>${esc(this.erreur)}</small>` : ""}${this.relance.plan ? `<br><small>${phrase(this.relance.plan)}</small>` : ""}
        <div class="row" style="margin-top:10px"><button class="primary" id="${i}reessayer">${this.relance.plan ? "Réessayer maintenant" : "Réessayer la transcription"}</button><button id="${i}oublier">L'effacer</button></div></div>`;
    return this.dispo ? `<div class="row"><button class="primary voixbtn" id="${i}enreg">🎙️ ${esc(this.o.libelle)}</button></div>` : "";
  }

  brancher(z: HTMLElement) {
    const on = (n: string, f: () => void) => { const b = z.querySelector<HTMLElement>("#" + this.o.id + n); if (b) b.onclick = f; };
    on("enreg", () => this.demarrer());
    on("arreter", () => this.arreter());
    on("annuler", () => { this.couperChrono(); this.enCours?.annuler(); this.enCours = null; this.direct = ""; this.o.redessiner(); });
    on("reessayer", () => { this.relance.annuler(); this.transcrire(); });
    on("oublier", async () => {
      if (!await confirmer("Effacer cet enregistrement ? Il n'a pas été transcrit.", "L'effacer")) return;
      this.relance.annuler(); this.attente = null; this.erreur = ""; await this.o.oublier(); this.o.redessiner();
    });
  }

  private couperChrono() { clearInterval(this.chrono); this.chrono = undefined; }

  async demarrer() {
    this.noms = await this.o.noms().catch(() => []);
    this.direct = "";
    try { this.enCours = await voix.enregistrer({ noms: this.noms, surTexte: this.montrerDirect }); }
    catch (e) { toast(e instanceof ErreurIA ? e.message : "Le micro n'a pas pu démarrer."); return; }
    this.chrono = setInterval(() => { const c = this.$("chrono"); if (c && this.enCours) c.textContent = voix.chrono(this.enCours, duree); }, 1000);
    this.o.redessiner();
  }

  async arreter() {
    const e = this.enCours; if (!e) return;
    this.couperChrono(); this.enCours = null;
    this.attente = await e.arreter();
    await this.o.garder(this.attente).catch(() => {});   // gardé tant qu'il n'est pas transcrit
    this.transcrire(e);
  }

  /* L'écran se ferme : un enregistrement en cours est arrêté et rendu, pour être GARDÉ par l'écran (jamais jeté sans
     « Annuler » confirmé) ; null s'il n'y en avait pas. jeter : après « Annuler » confirmé. */
  async quitter(jeter = false): Promise<Blob | null> {
    this.couperChrono(); this.relance.annuler();
    const e = this.enCours;
    this.enCours = null; this.direct = "";
    if (!e) return null;
    if (jeter) { e.annuler(); return null; }
    const son = await e.arreter();
    return son.size ? son : null;
  }

  /* e : l'enregistrement qui vient d'être arrêté ; son texte transcrit en direct évite de tout retranscrire */
  async transcrire(e?: voix.Enregistrement, essai = 1) {
    this.relance.annuler();
    if (!this.attente || this.travail) return;
    const son = this.attente;
    this.travail = true; this.o.redessiner();
    let t: string;
    try {
      const direct = e ? await e.texteDirect() : null;
      if (!direct && this.o.envoyer && await this.o.envoyer(son)) {
        // confié au PC : il n'est plus gardé ici
        this.direct = ""; if (this.attente === son) this.attente = null;
        await this.o.oublier().catch(() => {});
        this.erreur = ""; this.travail = false; this.o.redessiner();
        return;
      }
      t = direct || await voix.transcrire(son, this.noms.length ? this.noms : await this.o.noms().catch(() => []));
    } catch (err) {
      this.erreur = err instanceof ErreurIA ? err.message : "La transcription a échoué.";
      const p = this.relance.echec(err, essai);
      toast(this.erreur + (p ? (p.quand == null ? " Nouvel essai au retour du réseau." : " Nouvel essai dans 5 minutes.") : ""));
      this.travail = false; this.o.redessiner();
      return;
    }
    this.direct = "";
    if (this.attente === son) this.attente = null;
    await this.o.oublier().catch(() => {});
    this.erreur = "";
    this.travail = false; this.o.redessiner();
    await this.o.transcrit(t);
  }
}
