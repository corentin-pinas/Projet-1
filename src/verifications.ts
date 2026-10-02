/* Vérifications affichées sur l'écran d'accueil du socle : ce que Corentin doit voir « au vert »
   pour que l'appli soit bien installée et que ses données soient en sécurité sur la tablette. */

export type EtatAppareil = {
  installee: boolean;          // ouverte depuis l'icône de l'écran d'accueil
  horsConnexionPret: boolean;  // l'appli est gardée dans la tablette et s'ouvre sans internet
  stockageProtege: boolean | null; // null : le navigateur ne sait pas répondre
  espaceLibre: number | null;  // en octets
  protectionRefusee: boolean;  // la protection a été demandée et le navigateur a dit non
  brave: boolean;
};

export type Verification = {
  id: "installee" | "hors-connexion" | "stockage" | "espace";
  titre: string;
  ok: boolean;
  detail: string;
};

export function formatOctets(n: number): string {
  if (n >= 1e9) return (n / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Go";
  if (n >= 1e6) return Math.round(n / 1e6).toLocaleString("fr-FR") + " Mo";
  return Math.max(0, Math.round(n / 1e3)).toLocaleString("fr-FR") + " ko";
}

/* Un bilan PDF scanné pèse en général entre 1 et 5 Mo : 500 Mo laisse de la marge pour des centaines de bilans. */
const ESPACE_CONFORTABLE = 500e6;

export function verifications(e: EtatAppareil): Verification[] {
  return [
    {
      id: "installee",
      titre: "Appli installée sur la tablette",
      ok: e.installee,
      detail: e.installee
        ? "Ouverte depuis l'icône de l'écran d'accueil."
        : "Dans Brave, touchez le menu ⋮ puis « Ajouter à l'écran d'accueil », et rouvrez l'appli depuis l'icône."
    },
    {
      id: "hors-connexion",
      titre: "Fonctionne sans internet",
      ok: e.horsConnexionPret,
      detail: e.horsConnexionPret
        ? "L'appli est gardée dans la tablette et s'ouvre même sans réseau."
        : "Préparation en cours. Laissez l'appli ouverte quelques secondes avec internet."
    },
    {
      id: "stockage",
      titre: "Données protégées contre l'effacement",
      ok: e.stockageProtege === true,
      detail: e.stockageProtege === true
        ? "Le navigateur s'est engagé à ne pas effacer les données de l'appli."
        : e.stockageProtege === null
          ? "Ce navigateur ne permet pas de le vérifier."
          : e.protectionRefusee && e.brave
            ? "Brave refuse cette protection, par choix de confidentialité. Installez l'appli avec Chrome : il l'accorde aux applis installées."
            : e.protectionRefusee
              ? "Le navigateur a refusé. Installez l'appli sur l'écran d'accueil, puis réessayez."
              : "Pas encore accordé. Touchez « Protéger mes données ». L'installation sur l'écran d'accueil aide le navigateur à accepter."
    },
    {
      id: "espace",
      titre: "Place disponible",
      ok: e.espaceLibre !== null && e.espaceLibre >= ESPACE_CONFORTABLE,
      detail: e.espaceLibre === null
        ? "Ce navigateur ne permet pas de le vérifier."
        : formatOctets(e.espaceLibre) + " disponibles pour les bilans et les séances."
    }
  ];
}
