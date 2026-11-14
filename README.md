# Muninn — la mémoire du cabinet

Appli de suivi des patients d'un cabinet de kinésithérapie : bilans (PDF ou photos) résumés par l'IA, séances dictées à la voix et mises au propre, rendez-vous, « Ma journée », agenda, transmissions pour un remplaçant.

- Appli web installable (PWA), **Vite + TypeScript sans framework**.
- Les dossiers des patients restent **dans chaque appareil** (IndexedDB) : tablette, iPhone, PC. Chaque appareil marche seul, même sans réseau.
- Le **PC du cabinet** garde la base commune et relie les appareils par **Tailscale** (réseau privé). Il fait aussi tourner **Whisper**, qui transcrit la voix sans qu'elle sorte de chez le kiné.
- Le serveur **Railway** livre l'appli et relaie l'IA (Claude, par l'abonnement du kiné). **Il ne garde jamais aucune donnée patient.**

À lire aussi : `CLAUDE.md` (contexte, règles de travail, choix techniques), `REPRISE.md` (état du projet et historique des versions), `AUDIT.md` (audit de fond du 3 novembre 2026 et plan de nettoyage).

## Architecture

### Les appareils

```mermaid
flowchart LR
  subgraph Tailscale["Réseau privé Tailscale"]
    T[Tablette] <-->|échange| PC
    I[iPhone] <-->|échange| PC
    PC["PC : base commune + copies<br/>Whisper (voix → texte)"]
  end
  T -->|bilan ou séance à traiter| R[Serveur Railway]
  I --> R
  R -->|le temps du traitement| C[IA Claude]
```

### Dans chaque appareil : quatre étages

```mermaid
flowchart TB
  E["1 · Écrans<br/>app, journee, dictee, agenda, transmissions, reglages, copies, partage"]
  M["2 · Moteur (moteur.ts) : file du travail d'IA"]
  R["Règles pures (regles.ts, fusion.ts) : calculs sans IA"]
  B["3 · Base (db.ts) : IndexedDB + « cloche »"]
  K["4 · Coursiers : ia.ts → Railway · synchro.ts → PC · transcription.ts → Whisper"]
  E -->|écrivent| B
  B -.->|la cloche sonne| E
  M <--> B
  M --> K
  B <--> K
  E --> R
  M --> R
```

**La règle d'or : tout passe par la base.** Les écrans ne se parlent pas entre eux. Une action (enregistrer une séance, poser un rendez-vous) écrit dans la base, qui « sonne une cloche » (`db.abonner`). Ceux qui l'écoutent font chacun leur travail :

| Qui écoute | Ce qu'il fait | Écrit-il dans la base en retour ? |
|---|---|---|
| `app.ts`, `agenda.ts` | redessinent l'écran | non |
| `synchro.ts` | envoie au PC 2 s plus tard | seulement ce qu'il reçoit du PC, en se signalant (`applique`) pour ne pas se relancer lui-même |
| `travail-pc.ts` | le PC fait le travail en tâche de fond (1.9.0) : confier une dictée, une séance dite à la voix ou une mise au propre au PC ; travaux partagés et leur état | db, ia, synchro, ui ; pc/travail (règle `elaguer`) |
| `rangement.ts` | règles pures du rangement du résultat de l'IA (séance, dossier, passages d'une dictée), communes à l'appareil et au PC | ia (types), regles |
| `moteur.ts` | est lancé par une action (séance enregistrée, bilan ajouté), pas par la cloche | oui, le résultat de l'IA : la cloche sonne, l'écran se redessine, le partage l'envoie |

Il n'y a donc **pas de boucle** : rien de ce qui écoute la cloche ne la fait sonner de nouveau sans fin.

### Dépendances entre modules

Les flèches vont toujours dans le même sens : du démarrage vers les écrans, des écrans vers le moteur et la base, et tout le monde vers les règles pures. **Aucune dépendance circulaire.** C'est vérifié à chaque `npm test` par `tests/unite/architecture.test.ts`, qui échoue si une boucle apparaît, si une règle pure se met à dépendre d'un autre module, ou si un module autre que `main.ts` dépend de `app.ts`.

| Module | Rôle | Dépend de |
|---|---|---|
| `main.ts` | démarrage : ouvre la base, branche le partage, propose les mises à jour | alerte-code, app, export-dossier, fenetres, copies, db, mascotte, moteur, partage, reglages, reglages-ia, synchro, travail-pc, ui, verifications |
| `app.ts` | liste des patients, fiche (bilans, séances, rendez-vous, homonymes), visionneuse | agenda, db, dictee, journee, moteur, objectifs, pdf, prochain-rdv, regles, seances-manquantes, travail-pc, ui, voix-seance |
| `journee.ts` | « Ma journée », avec l'alerte « sans rendez-vous » (30 jours ; archivage proposé à 3 mois) | db, regles, ui |
| `agenda.ts` | agenda de la semaine en demi-journées | db, regles, transmissions, ui |
| `transmissions.ts`, `transmissions-pdf.ts` | transmissions pour un remplaçant et leur PDF (sans IA) | db, regles, ui |
| `dictee.ts` | dictée groupée, rangée patient par patient | db, enregistreur, ia, moteur, objectifs, prochain-rdv, regles, relance, seances-manquantes, transcription, travail-pc, ui |
| `voix-seance.ts` | « Enregistrer ma séance » sur la fiche (confiée au PC quand il est prêt) | db, enregistreur, travail-pc, ui |
| `enregistreur.ts` | l'enregistreur de voix commun (micro, chrono, texte en direct, voix gardée, transcription, relances, boutons) | ia, relance, transcription, ui |
| `relance.ts` | relances automatiques après un échec (5 minutes, 3 essais au plus, selon la cause), compte à rebours | ia |
| `alerte-code.ts` | bandeau « mauvais codes d'accès » (3 en 24 heures sur le serveur) | db, ui |
| `copies.ts`, `fichier-copie.ts` | copies de sécurité internes et fichier chiffré hors de Chrome | db, regles, ui, verifications |
| `partage.ts` | écran du partage avec le PC | synchro, transcription, ui |
| `reglages.ts`, `palettes.ts`, `saisons.ts`, `mascotte.ts` | affichage, couleurs, décorations, corbeau | — |
| `export-dossier.ts`, `dossier-pdf.ts` | Réglages : dossier complet d'un patient en PDF, pour un contrôle (archivés compris) | db, regles, ui ; transmissions-pdf |
| `reglages-ia.ts` | réglages de l'IA (abonnement, clé de secours) | db, ia, moteur, regles, ui |
| `seances-manquantes.ts` | jour de rendez-vous passé sans séance (fiche et récapitulatif de la dictée) : retrouver le patient dans la dictée gardée, ou noter l'absence | db, ia, moteur, regles, ui |
| `prochain-rdv.ts` | question « Prochain rendez-vous ? » (date + matin / après-midi, ou fin de traitement), sur la fiche et après la dictée groupée | db, regles, ui |
| `objectifs.ts` | objectifs du patient : encadré de la fiche (lus dans le bilan, « Modifier »), objectifs dits dans une dictée proposés (« Remplacer », « Ajouter », « Ignorer ») | db, regles, ui |
| `moteur.ts` | file d'attente de l'IA : résumés de bilans, mises au propre, rangement des dictées ; un travail par fenêtre (`navigator.locks`) ; confie au PC quand il est prêt | db, ia, pdf, rangement, regles, relance, travail-pc |
| `ia.ts` | consignes données à l'IA, garde-fous, appels | regles |
| `synchro.ts`, `fusion.ts` | échanges avec le PC ; fusion de deux changements faits sur deux appareils | db, fusion, regles |
| `transcription.ts` | voix : Whisper du PC d'abord (en direct, par morceaux coupés aux pauses), Railway en secours | db, ia, regles, synchro |
| `db.ts` | la base IndexedDB `mes-patients` (version 4) et sa cloche | regles |
| `regles.ts` | règles du cabinet, pures et testées : noms, classement, « À venir », homonymes, demi-journées, archivage, alerte « sans rendez-vous » | — |
| `ui.ts`, `pdf.ts`, `verifications.ts` | messages et confirmations, lecteur PDF, vérifications de l'appareil | — |
| `fenetres.ts` | fermer une fenêtre en touchant à côté (en demandant si une saisie est en cours) | ui |

### Hors de l'appli

| Fichier | Où il tourne | Rôle |
|---|---|---|
| `server.mjs` | Railway | livre `dist/`, relaie l'IA (`/api/ia/*`, code d'accès exigé) ; aucune donnée gardée |
| `serveur/claude.mjs` | Railway | lance Claude Code verrouillé (sans outils, sans mémoire), une demande à la fois |
| `serveur/transcription.mjs` | Railway | transcription de secours (inactive tant que `WHISPER_URL` n'est pas réglé) |
| `public/pc/muninn-pc.mjs` | PC | base commune (`donnees.json`, `fichiers/`, `copies/` sur 30 jours ; un élément supprimé et ses PDF effacés définitivement 30 jours après), un seul fichier sans dépendance, joignable seulement par Tailscale avec le code du PC |
| `public/pc/travail.mjs` | PC | travail en tâche de fond (1.9.0), construit depuis `src/pc/travail.ts` (`npm run pc`) : transcrit, demande l'IA au serveur de l'appli, range dans la base, réessaie seul |
| `public/pc/lanceur.mjs` | PC | seule tâche Windows : fait tourner le partage et Whisper, met à jour `muninn-pc.mjs`, `voix.py` et `travail.mjs` |
| `public/pc/voix.py` | PC | Whisper (faster-whisper), n'écoute que le PC lui-même |
| `public/pc/installer.ps1` | PC | installation et mise à jour en une ligne, sans toucher aux données |

## Commandes

```sh
npm ci              # dépendances
npm run dev         # développement
npm test            # règles, base, partage avec le vrai programme du PC, architecture (Vitest)
npm run test:e2e    # écrans en largeur tablette (Playwright, construit l'appli d'abord)
npm run build       # vérifie les types puis construit dist/
```

Tests : `src/*.test.ts` (règles, base, IA, copies…), `tests/unite/` (partage entre appareils simulés, démarrage du PC, architecture), `tests/e2e/` (écrans ; l'IA, Claude Code et Whisper y sont simulés : aucune vraie requête). Un défaut connu pas encore corrigé est écrit comme un test `it.fails` qui décrit le bon comportement.

## Mise en production

- Travail sur une branche à part ; `npm test` et `npm run test:e2e` au vert avant chaque envoi.
- La production est la branche `claude/patient-management-planning-xg8y6k`, déployée par Railway à chaque envoi, et seulement avec l'accord explicite du kiné (« mets en production »).
- Les appareils proposent la nouvelle version par un bandeau « Mettre à jour » : jamais de rechargement automatique, pour ne pas perdre une dictée en cours.

## Confidentialité

Prénom et initiale du nom seulement, âge sans date de naissance, médecin désigné par sa spécialité. Données de santé pseudonymisées, gardées dans les appareils et sur le PC du kiné ; rien n'est stocké sur Railway (non certifié HDS). La voix ne quitte pas le réseau privé. Seul le texte à traiter part chez Anthropic, le temps du traitement.
