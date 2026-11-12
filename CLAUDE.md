# CLAUDE.md — Appli de suivi patients (kinésithérapie)

> **Point de reprise le plus récent : `REPRISE.md`** (état au 12 novembre 2026, version 1.8.0 en production, nettoyage de l'audit terminé (restent E3 partie 2, F8, M9), décisions, prochaines étapes).

Contexte repris du travail fait dans claude.ai (projet « Gestion Patient assistée »), le 2 octobre 2026.
Source complète : `reference/contexte-claude-ai.pdf`. Code de la version d'essai : `reference/bilans-seances-essai.html`.

## L'utilisateur

- Corentin, kinésithérapeute en cabinet à Toulouse. Prise en charge surtout orientée épaule.
- **Ne sait pas coder et ne relit pas la technique.** Il laisse les choix d'architecture à Claude et veut être guidé de bout en bout.
- Il dicte ses messages à la voix : attendre des phrases orales, parfois approximatives.
- Matériel : tablette Android au cabinet (Samsung, usage en paysage, appli installée avec Chrome), iPhone 15 Pro Max, et depuis le 30 octobre 2026 un PC Windows 11 Famille chez lui (il y utilise aussi Muninn ; il fait tourner le partage et Whisper). Tailscale sur les trois.
- **Brave refuse la protection du stockage** (`navigator.storage.persist()` renvoie faux, constaté le 2 octobre 2026 sur sa tablette). L'appli doit être installée avec Chrome, qui l'accorde aux applis installées. Corentin peut continuer à naviguer avec Brave.
- Les marches à suivre restent pensées pour la tablette (GitHub, Railway, compte IA) ; le PC sert pour ce qui doit tourner dessus (installation par `irm …/pc/installer.ps1 | iex` dans « Terminal (administrateur) »).
- Agenda du cabinet : Maiia. Aucune connexion possible avec l'appli pour l'instant.
- Abonnement Claude : **Pro** (quota partagé avec son propre usage de Claude). Volume : 3 à 8 nouveaux bilans et 80 à 110 séances par semaine.
- Bilans : une trame PDF tapée qu'il remplit au stylet sur la tablette. L'IA reçoit chaque page dessinée en image sur la tablette (écriture au stylet comprise, comme dans la visionneuse) et le texte tapé de la trame à part (`pdfPourIA` dans `src/moteur.ts`, 12 pages au plus). Si l'écriture est visible dans « Voir le bilan complet », l'IA la voit aussi.

## Comment travailler avec lui

- Répondre en français, sans jargon, en commençant par le résultat.
- Expliquer ce qui change à l'écran et comment s'en servir, pas le code.
- Dire franchement ce qui n'a pas été testé et ce qui n'est pas faisable.
- Ne jamais modifier une version qui fonctionne : travailler sur une copie d'essai.
- Objectif constant : **lui faire gagner du temps**. Une fonction qui demande une manipulation en plus perd son intérêt.
- Interface épurée, gros boutons, lisible sur tablette. Couleurs et préférences d'affichage doivent pouvoir évoluer.
- Pendant la phase de plan : chaque réponse est illustrée par un schéma, une maquette ou un organigramme qui montre où on en est.

## Ce que fait l'appli

Centraliser les bilans des patients (PDF ou photos) avec un résumé « coup d'œil », noter chaque séance, et voir le matin les patients du jour avec ce qui est prévu pour eux.

## État actuel dans claude.ai

Trois pages publiées (artifacts privés) :

| Version | Rôle |
|---|---|
| « Mes bilans » | Première version stable. Ne pas toucher. |
| « Mes bilans et séances » | Version stable avec séances datées. Ne pas toucher. https://claude.ai/artifact/PpBTSngWiWo9yBa4qzdMwD |
| « Mes bilans et séances, version d'essai » | Copie de travail, toutes les nouveautés. https://claude.ai/artifact/E5HrqnxW46Uu577u29KCFU |

Le fichier HTML ne fonctionne pas hors de claude.ai. Il s'appuie sur `window.claude.use(...)` :

- `db` : base de données (collections, documents, écoute en temps réel `onSnapshot`) ;
- `assets` : stockage des PDF et images des bilans ;
- `user` : identifiant de l'utilisateur, préfixe privé des données ;
- `sample` : appel à l'IA (`sample.json(...)`), pour la mise au propre des séances.

Pour une appli autonome il faut remplacer ces quatre briques. Les données existantes (2 bilans de test, 1 séance) restent dans les artifacts.

## Fonctionnalités de la version d'essai

### Bilans
- Dépôt d'un ou plusieurs PDF ou photos. Le nom du patient est tiré du nom du fichier, après « - » : « Fiche Bilan Épaule - Stéphanie V » donne « Stéphanie V. ».
- Un nom entier est réduit à son initiale ; une abréviation de 1 à 3 lettres (« Fr ») est gardée.
- Le résumé n'est pas produit par la page : Corentin écrit à Claude « Résume les nouveaux bilans, avec l'âge », Claude lit le PDF et écrit le résumé dans la base.
- Chaque point « à vérifier » peut être validé (« C'est juste ») ou corrigé. Les corrections sont conservées.
- Le bilan complet s'ouvre dans une visionneuse.

### Séances
- Bouton « Dicter la séance » : formulaire, date du jour, curseur dans le texte. Corentin utilise le micro du clavier.
- Un vrai enregistreur vocal a été écarté (pas d'accès au micro dans la page, l'IA ne lit pas l'audio).
- À l'enregistrement, l'IA met le texte au propre et le range en rubriques : **État du patient**, **Fait en séance**, **À faire à la maison**, **Autres notes**, **À venir**. Règle stricte : corriger et ranger, sans rien ajouter, interpréter ni retirer.
- Le texte dicté d'origine reste consultable.
- Si Corentin corrige à la main un texte mis au propre, sa version fait foi.
- Garde-fou : une mise au propre plus courte que 35 % du texte dicté est rejetée.

### « À venir »
- Repéré après « pour la prochaine séance » (variantes : « pour la prochaine », « la prochaine fois », « à venir : »).
- Résumé court affiché sous le nom du patient, avec la date de la séance d'origine.
- C'est toujours la séance la plus récente qui compte.

### Rendez-vous et classement
- Prochain rendez-vous saisi à la main (date, heure), modifiable et effaçable.
- Si la note dit quand a lieu la suivante (« dans une semaine à 8 heures »), l'IA place le rendez-vous, compté depuis la date de la séance. En cas d'ambiguïté, rien n'est placé.
- La page fournit à l'IA un calendrier des jours à venir : l'IA lit la date, elle ne la calcule pas.
- Plusieurs rendez-vous possibles (un par jour au plus).
- Liste classée : « Aujourd'hui » en tête par heure, puis « Demain », puis les jours suivants, enfin « Sans rendez-vous prévu » par ordre alphabétique. Un rendez-vous passé ne compte plus.

### Homonymes
- Un dossier = une personne, avec un ou plusieurs bilans. Séances et rendez-vous sont rattachés au dossier.
- Même prénom + même initiale : distingués par l'âge affiché à côté du nom.
- Si les âges sont compatibles, une icône « ? » et la question « Même personne ? » :
  - **Oui** : bilans réunis dans un seul dossier ;
  - **Non** : l'appli demande la deuxième lettre du nom (« Sylvie Fr. »).
- Âges compatibles = même âge à un an près, plus un an par année écoulée entre les deux bilans (date écrite sur le bilan).
- La question n'est posée qu'une fois le bilan résumé (l'âge vient du résumé).

## Modèle de données (version d'essai)

Deux collections sous `data/users/<id>/`.

`bilans/liste` — un document par bilan :
- `fichier`, `patient` (« Prénom I. »), `ajoute` (ISO) ;
- `fichiers` : `[{id, url, type}]` ;
- `resume` : `null` ou `{region, date_bilan (JJ/MM/AAAA), age, coup_oeil, chiffres: [{label, valeur}], sections: [{titre, items: []}], a_verifier: []}` ;
- `valides`, `corrections: [{point, correction, quand}]` ;
- `rdvs: [{d: "AAAA-MM-JJ", h: "HH:MM"}]` (ancien format `rdv_date`, `rdv_heure` encore lu) ;
- `dossier` (clé si différente du nom), `homonyme: true` tant que la question est en attente.

`seances/liste` — un document par séance :
- `patient` (clé du dossier), `date` (AAAA-MM-JJ), `cree` (ISO) ;
- `contenu`, `propre`, `propre_source` (valable si `propre_source === contenu`), `brut` ;
- `avenir_resume`, `avenir_source`, `ia_ok`.

Clé de dossier : `bilan.dossier || bilan.patient`.

## Confidentialité (RGPD)

Règles fixées par Corentin :
- **Prénom + première lettre du nom uniquement**, y compris dans les noms de fichiers.
- **Âge conservé**, pas la date de naissance.
- **Médecin : spécialité seulement**, jamais son nom.
- **Métier peu détaillé**, sans employeur.
- **Activités du quotidien conservées** (utiles au soin), sans nom de club ni commune.
- Pas de nom complet dicté dans les notes.

Points ouverts :
- Les 2 bilans de test contiennent encore un nom complet.
- Données de santé **pseudonymisées**, pas anonymes. L'hébergement de données de santé pour un professionnel relève de la certification HDS. Avis ferme : CNIL ou Ordre des kinésithérapeutes.

## Décisions pour la version autonome (2 octobre 2026)

- **Tablette seule** pour la première version : les données restent sur la tablette (pas de serveur qui stocke les patients), sauvegarde chiffrée hebdomadaire. Un serveur certifié HDS reste possible plus tard (téléphone).
- **Résumé automatique des bilans** dès le dépôt du PDF, sans passer par le chat.
- **On repart de zéro** : les données de test des pages claude.ai ne sont pas reprises.
- **D'abord à l'identique** : reproduire la version d'essai, l'utiliser en vrai, puis ajouter les idées une par une.
- **Dictée groupée** (étape 4) : plusieurs patients dictés d'un bloc ; rangement automatique quand le patient est le seul de ce nom parmi les rendez-vous du jour, validation seulement en cas de doute ; récapitulatif avec « Annuler ». Nom complet dicté réduit automatiquement à l'initiale.
- **IA par l'abonnement Claude** (7 octobre 2026) : demandé par Corentin, mode principal ; la clé API devient un secours verrouillé.
- **Niveaux d'IA** (7 octobre 2026, choix de Corentin) : la plus puissante pour les bilans et la dictée groupée (une ou deux fois par jour : midi et/ou soir), une plus légère pour les séances. `MODELES` dans `src/ia.ts` : puissant = `claude-opus-5-5` / `opus`, léger = `claude-sonnet-5-5` / `sonnet` (clé API / abonnement).
- **Voix** : micro du clavier au début ; depuis 1.1 (1er novembre 2026), Whisper sur le PC de Corentin (la voix ne sort pas de chez lui).

## Décisions prises et pistes écartées

- Import du planning par capture d'écran : construit puis retiré (envoyait les noms complets).
- Connexion à Maiia : inexistante.
- Propositions de séance par l'IA : mises de côté, à reproposer une fois le socle stable, appuyées sur la littérature.
- Dossier à plusieurs bilans : une seule liste de séances continue.
- Noms des rubriques de séance : choix de Claude, à ajuster.

## Pas encore testé en conditions réelles

- Mise au propre des séances (termes techniques) ;
- placement automatique du rendez-vous dicté ;
- question « même personne ? » lors d'un vrai ajout.

## Idées pour la suite (Corentin)

- Résumé en tête de fiche : nouvelle séance, exercices maison, observance chiffrée, EVA.
- Suivi des exercices à domicile (observance, pertinence ressentie) ; priorité à la douleur ; amplitudes en point périodique.
- Clôture de prise en charge avec historique.
- Écran Paramètres : sauvegardes, gestion ; sauvegarde hebdomadaire.
- Lecture automatique d'un dossier de bilans.
- Conserver le marquage des douleurs sur le schéma corporel (page 1 du bilan).
- **Suivi de l'évolution et alertes** (1er novembre 2026, grande idée pour plus tard) : repérer les patients qui évoluent favorablement (on continue le protocole) et ceux qui stagnent ou se dégradent, avec une alerte pour Corentin (« rotation externe travaillée, pas de progrès ; amplitude travaillée, pas de progrès ») qui l'invite à changer d'angle, à demander une prescription ou de nouveaux examens. Pas de chiffres à saisir : l'évolution se lit dans les séances dictées (« douleur inchangée », « les amplitudes stagnent », « rotation externe travaillée sans progrès »), l'IA en fait la synthèse.
- **Absences** (2 novembre 2026, pour plus tard) : pouvoir dire « Madame X absente ce jour » quand un rendez-vous prévu n'a pas eu lieu, et suivre l'absentéisme de chaque patient.
- **Notes vocales d'un remplaçant** (4 novembre 2026, idée à confirmer : Corentin ne sait pas si ses remplaçants le feront) : le remplaçant envoie des notes vocales (WhatsApp, SMS…) sur ce qu'il a fait avec chaque patient ; Corentin les importe dans Muninn (bouton « Importer des notes vocales » dans la dictée groupée, plusieurs fichiers à la fois ; sur la tablette Android, aussi « Partager → Muninn » si l'appli installée le permet ; sur l'iPhone, enregistrer dans Fichiers puis importer). Même chemin que la dictée : Whisper du PC (formats ogg/opus, m4a, mp3, wav), rangement par patient, séances marquées « faite par le remplaçant ». Le remplaçant doit dire prénom + initiale.
- **PC qui se met à jour tout seul** (8 novembre 2026, tâche à venir) : vérification quotidienne d'une nouvelle version, installée sans relancer la ligne d'installation.
- **Un collègue sur Muninn** (8 novembre 2026, idée) : sa propre clé API (pas l'abonnement Pro), son PC, ses patients chez lui, même adresse ; nouvelles versions essayées d'abord un jour par Corentin avant de partir chez le collègue (choix de Corentin).
- **Transmissions** (7 octobre 2026) : un bouton qui, pour une période choisie (une semaine, quinze jours…), résume tous les patients ayant rendez-vous dans la période, pour un remplaçant : pathologie, état à l'arrivée, traitement en cours. Sortie : un **PDF** que Corentin envoie par message (le remplaçant l'imprime s'il veut).
- **Agenda** (7 octobre 2026) : une vue d'ensemble de l'emploi du temps dans l'appli (Maiia et Doctolib ne sont pas reliés), pour repérer les trous anormaux et ajouter un patient dans un créneau. Sert à fiabiliser les transmissions sur 15 jours ; de petits écarts ensuite sont acceptables.

## Lecture des bilans manuscrits

Bilans mixtes (tapé et manuscrit au stylet). Conventions : MVT = mouvement ; « + » entouré = test positif ; « − » entouré = négatif ; rond barré = non fait ; grande croix ou rond barré sur une partie (ex. EVA) = non évalué car non pertinent. Devant une abréviation inconnue, proposer une interprétation et la signaler dans « à vérifier ».

## Code (version autonome)

- Plan validé : `PLAN.md`. Étape en cours suivie dans ce fichier et sur la carte du projet (https://claude.ai/artifact/7vULqC1G8oPWJv1P8w5ZHb).
- Appli web installable (PWA) : Vite + TypeScript, sans framework. `vite-plugin-pwa` pour le hors-connexion. Police Atkinson Hyperlegible hébergée avec l'appli.
- Couleurs uniquement via les variables CSS de `src/styles.css` (palettes et thème à venir).
- Commandes : `npm run dev` (développement), `npm test` (règles métier, Vitest), `npm run test:e2e` (écrans en largeur tablette, Playwright ; Chromium dans `/opt/pw-browsers/chromium` en session cloud), `npm run build` (vérifie les types puis construit `dist/`), `npm run icons` (régénère les icônes PNG depuis `public/icons/icon.svg`).
- Mise en ligne : Railway (choix de Corentin, 5 €/mois, un collègue le connaît). Railway lance `npm run build` puis `node server.mjs` directement (serveur Node sans dépendance qui livre `dist/`) : passer par `npm start` faisait sortir en erreur à chaque remplacement de version (SIGTERM) et Railway envoyait un faux mail « Deploy Crashed ». Le serveur s’arrête proprement sur SIGTERM et arrête Claude Code. Réglages dans `railway.json`. Aucune donnée patient ne doit jamais être stockée sur le serveur (Railway n'est pas certifié HDS).
- Structure : `src/regles.ts` (règles métier pures, reprises de la version d'essai), `src/db.ts` (IndexedDB : dossiers, bilans, séances, fichiers), `src/app.ts` (écrans), `src/main.ts` (démarrage, état de l'appli, mises à jour), `src/ui.ts` (messages, confirmation), `src/pdf.ts` (lecteur PDF chargé à la demande).
- Modèle de données de la version autonome : un dossier porte le nom affiché, les rendez-vous et le drapeau `homonyme` ; bilans et séances y sont rattachés par `dossierId`. Supprimer le dernier bilan d'un dossier supprime le dossier et ses séances (confirmation explicite).
- `pdfjs-dist` figé en 4.10.38 : la 6.x utilise `Map.getOrInsertComputed`, absent de Chrome < 145.
- Mises à jour en mode « prompt » : bandeau « Mettre à jour », jamais de rechargement automatique (ne pas perdre une dictée en cours).
- IA (étape 3) : `src/ia.ts` (appels, prompts, garde-fous ; SDK `@anthropic-ai/sdk` appelé depuis le navigateur avec `dangerouslyAllowBrowser`, la clé de Corentin rangée dans le store `parametres`), `src/moteur.ts` (résumés automatiques en file, analyse des séances, consommation du mois). Modèle `claude-opus-5-5` (4 $ / 20 $ par million de jetons), repli `fallbacks: "default"` en cas de refus, sortie JSON imposée par `output_config.format`. Effort `high` pour les bilans (lecture du manuscrit), `medium` pour les séances. Les corrections « à vérifier » sont renvoyées à l'IA dans le prompt des bilans suivants.
- **IA par l'abonnement (version 0.4, mode principal)** : mécanisme décrit dans `reference/mecanisme-abonnement-claude-code.md`, adapté à « tablette + serveur Railway ». Claude Code (dépendance npm `@anthropic-ai/claude-code`) tourne sur le serveur, connecté à l'abonnement Claude de Corentin. `serveur/claude.mjs` : recherche de l'exécutable, état (`--version`, `auth status`), connexion sans terminal (`auth login --claudeai`, lien relayé à la tablette, code renvoyé sur l'entrée standard), et travail : `claude -p --input-format stream-json --output-format stream-json --json-schema … --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources "" --no-session-persistence --model opus --effort …`, demande (texte, PDF, images) sur l'entrée standard, réponse lue dans `structured_output` de la ligne `result`. Une seule génération à la fois, 12 minutes au plus depuis 1.2.3 (`CLAUDE_DELAI_MS` ; 5 minutes avant, trop court pour une dictée d'après-midi), arrêt du seul processus lancé et de ses enfants. Écart assumé avec le document : pas de serveur MCP, car un seul document entre et un seul JSON sort ; sans aucun outil, c'est encore plus verrouillé.
- Règles : le jeton de connexion de Claude Code n'est jamais lu ni transmis ; Claude Code reçoit un environnement minimal (ni clé API, ni `CODE_ACCES`). Les routes `/api/ia/*` exigent le code d'accès (`Authorization: Bearer`, variable Railway `CODE_ACCES`, 12 caractères au moins ; 5 erreurs = 10 minutes de blocage). La connexion de Claude Code est gardée dans un volume Railway monté sur `/data` (`CLAUDE_CONFIG_DIR=/data/claude` par défaut si `/data` existe).
- Confidentialité : en mode abonnement, le bilan ou le texte de séance transite par le serveur Railway (en mémoire, le temps de la demande, jamais écrit sur disque) avant d'aller chez Anthropic.
- Clé API : secours, verrouillée par défaut (`api_autorisee`), choisie par `mode_ia`. Réglages dans `src/reglages-ia.ts`.
- Les tests d'écran simulent l'API Anthropic (`page.route`) et Claude Code (`tests/faux/claude.mjs`, via `CLAUDE_BIN`) : aucune vraie requête n'est faite dans les tests.
- Copies de sécurité (version 0.5.0) : store `copies` (base version 3), une par jour avant le premier changement, 7 gardées, texte seulement ; fichiers gardés tant qu'un bilan ou une copie y renvoie ; retour en arrière annulable (`avant-retour`). Écran dans `src/copies.ts`. Copie hors de Chrome (0.5.1) : fichier chiffré téléchargé dans « Téléchargements » (`src/fichier-copie.ts`, mot de passe retenu dans `parametres`), restauration depuis le fichier, rappel après 7 jours dans les vérifications. Pas de Drive.
- Dictée groupée (0.6.0) : `src/dictee.ts` (écran), `moteur.rangerDictee` / `rangerSeance`, `decouperDictee` et `lireDictee` dans `src/ia.ts`, `rattacher` dans `src/regles.ts`. Détails dans `REPRISE.md`.
- Corrections « à vérifier » (0.6.2) : reportées dans le résumé par l'IA légère (`corrigerResume`, garde-fou : résumé corrigé ≥ 70 % de l'original), `appliquee` sur chaque correction ; les anciennes sont reportées à l'ouverture (`corrigerEnAttente`). Prénoms composés gardés (`patientFrom`, particules « Le Goff » dans le nom) ; bouton « Modifier le nom » sur la fiche.
- Agenda et patients sans bilan (0.7.0) : `src/agenda.ts`, règles `semaine`, `plageDemi`, `rdvsDuJour`, `dureeRdv` dans `src/regles.ts` ; `db.creerPatient`, `db.supprimerPatient`, `ajouterBilan(fichiers, dossierId?)`. Dictée enregistrée prête pour Whisper : `src/transcription.ts`, `serveur/transcription.mjs` (faux Whisper des tests : `tests/faux/whisper.mjs`, micro simulé par Chromium). Détails dans `REPRISE.md`.
- Réglages d'affichage (0.8.0) : `src/reglages.ts` (fond, couleur parmi les 11 palettes de `src/palettes.ts` injectées en feuille de style, lisibilité vérifiée par `palettes.test.ts` ; contraste fort, taille du texte, 8 écritures hébergées avec l'appli, décorations ; mascotte « petit kiné à lunettes » dans `src/mascotte.ts` : flotte et cligne des yeux au repos, rit, saute ou s'étire quand on la touche, col aux couleurs de la palette), gardés dans le `localStorage` de la tablette et appliqués avant le premier affichage ; `src/saisons.ts` (anniversaire de Corentin du 10 au 16 mars avec un mot le 13, Pâques des Rameaux au lundi de Pâques, Halloween du 24 octobre au 1er novembre, Noël du 1er au 26 décembre en 5 niveaux de plus en plus fournis (`niveauNoel`) ; chapeau de saison sur la mascotte ; décorations dans les coins, `pointer-events:none` sauf l'araignée qui remonte quand on la touche, chauve-souris de passage, immobiles si animations réduites).
- Ma journée (0.9.0) : `src/journee.ts`, écran d'accueil à droite quand aucun patient n'est ouvert ; règles `journee`, `prochaineJournee`, `brefDe` dans `src/regles.ts` ; résumé court `bref` de chaque séance produit par l'IA légère avec la mise au propre.
- Nom de l'appli (0.9.1, choix de Corentin) : **Muninn**, « la mémoire du cabinet » (corbeau d'Odin). Icône corbeau dans `public/icons/icon.svg` (PNG par `npm run icons`). Le corbeau est l'emblème et la seule mascotte (style rond « kawaii », choix de Corentin ; petit kiné retiré en 0.9.4) : `src/mascotte.ts`, corbeau sur un perchoir (`.compagnon`), chapeaux de saison, tour en vol à travers l'appli ; dans la marge gauche à partir de 1620 px de large. Couleur d'origine « Muninn » dans `src/palettes.ts` (bleu nuit, nuit et lune dorée en sombre). Tablette de Corentin : environ 1690 × 1000 en paysage. La base IndexedDB garde son nom `mes-patients` : ne pas la renommer (les données seraient perdues de vue).
- Transmissions (0.10.0) : `src/transmissions.ts` (écran ouvert depuis l'Agenda), `src/transmissions-pdf.ts` (jsPDF 4.2.1, chargé à la demande, police Helvetica : caractères hors latin remplacés par `propre`), règles `transmissions`, `joursSansRdv`, `semaineProchaine`. Pas d'IA : le PDF reprend fidèlement bilans et séances. Mot pour le remplaçant dans `parametres` (`transmissions_mot`).
- Demi-journées (0.11.0, choix de Corentin) : plus d'heure de rendez-vous à l'écran ; `Rdv.p` (« am » / « pm »), `demiDe` (sinon d'après l'heure, avant 13 h = matin), `DEMI_FR`, `plageDemi`, `placesPlage`, `placesPrises` dans `src/regles.ts` ; `avecRdv(list, d, h, t, p)` ; l'IA rend `rdv_demi`.
- Accueil (0.12.0) : liste de tous les patients cachée (`#listebtn`, `localStorage` « liste-patients » ; la recherche l'affiche) ; « Ma journée » sur la demi-journée en cours (`vueParDefaut` dans `src/journee.ts`). Les tests d'écran qui passent par la liste l'ouvrent par `addInitScript`. Mise en page (0.12.1) : au-delà de 820 px, colonne de gauche de 250 px (corbeau, nom, boutons empilés), appli sur toute la largeur (1900 px au plus), « Ma journée » en colonnes de 340 px minimum (3 en paysage sur la tablette).
- Partage avec le PC (1.0.0, PC Windows Famille chez Corentin, Tailscale sur tous les appareils) : `public/pc/muninn-pc.mjs` (garde la base, ne répond qu'au code du PC, joignable seulement par Tailscale), `public/pc/installer.ps1`, `src/synchro.ts`, `src/fusion.ts`, `src/partage.ts` ; base IndexedDB version 4. Chaque appareil garde tout et marche seul. Détails et ordre de mise en route dans `REPRISE.md`.
- Dictée à la voix (1.1 à 1.2) : Whisper (faster-whisper, `public/pc/voix.py`) sur le PC, relayé par `muninn-pc.mjs` (`/api/voix/*`) ; dans l'appli `src/transcription.ts` (PC d'abord, Railway en secours), bouton « Enregistrer ma dictée » (dictée groupée) et « Enregistrer ma séance » (`src/voix-seance.ts`, formulaire d'une séance). Sitôt transcrite, la séance s'enregistre et la dictée se range seule (choix de Corentin, pas de relecture). `av==18.1.0` figé dans l'installateur (av 19 casse faster-whisper 1.2.1).
- Rendez-vous dicté (1.3.0, choix de Corentin du 5 novembre 2026) : « mardi » / « mardi prochain » = premier mardi après la séance, « mardi en huit » = semaine suivante (`REGLE_JOUR` dans `src/ia.ts`) ; matin / après-midi non dit → même demi-journée que la séance (`demiSeance`, rendez-vous du jour de la séance) ; rendez-vous passés gardés (historique, futures absences). Si rien de clair n'est dit : question « Prochain rendez-vous ? » (`src/prochain-rdv.ts`, règle `questionRdv` : dernière séance de moins de 21 jours, aucun rendez-vous après elle, pas de fin de traitement notée) sur la fiche (après l'analyse de la séance) et dans le récapitulatif de la dictée groupée : date + « Matin » / « Après-midi », ou « Fin de traitement » (`Dossier.fin`, `db.finTraitement`, « Annuler la fin » sur la fiche).
- Séances manquantes et dictées gardées (1.4.0, choix de Corentin du 5 novembre 2026 ; audit E3 partie 1) : chaque dictée groupée est gardée telle que dictée avant le rangement (`db.garderDictee`, paramètre partagé `dictees` = `{ dictees: [...] }`, 30 dernières, réunies élément par élément par `fusion.ts`). Règles `seancesManquantes` (rendez-vous passé de moins de 30 jours sans séance ni absence) et `sansSeanceCeJour` (après une dictée) dans `src/regles.ts`. Écran `src/seances-manquantes.ts` : encadré orange dans la liste des séances de la fiche et dans le récapitulatif de la dictée, « Retrouver dans mes dictées » (`moteur.chercherSeance` → `ia.chercherDansDictee`, IA légère, passage refusé si moins de 85 % de ses mots viennent de la dictée), « Ranger cette séance » (`moteur.rangerPassage`), « Il était absent » (`Dossier.absences`, `db.noterAbsence`, ligne grise « Absent le … » avec « Annuler ») ; lien « Une séance manque un autre jour ? » en bas de la liste.
- Bug corrigé en 1.2.1 : quand Android coupe le micro (écran éteint), l'enregistreur s'arrête seul ; `enregistrer()` le gère (`coupe()`, `chrono()`).
- Audit de fond prévu (3 novembre 2026) : lecture seule dans une nouvelle conversation, rapport `AUDIT.md`, puis nettoyage par petites étapes sans changement visible. Pas de réécriture complète.
- `README.md` : présentation et architecture (étages, « cloche » de la base, dépendances entre modules). `tests/unite/architecture.test.ts` interdit les dépendances circulaires entre modules de `src/` et garde les règles pures sans dépendance : à mettre à jour (avec le README) si un module est ajouté.
- Nettoyage de l'audit (depuis 1.2.2) : une étape du plan d'`AUDIT.md` § 4 par version. Tests de partage et du PC dans `tests/unite/` (inclus par `vite.config.ts`, hors `tsconfig` car ils utilisent Node) ; un défaut pas encore corrigé = un `it.fails` qui décrit le bon comportement.
- Paquet « filet » de l'audit (1.4.1) : voix non transcrite gardée dans la base (`voix_attente_seance` avec le dossier, `voix_attente_dictee`), jamais jetée en changeant d'écran (`voixSeance.quitter()` l'arrête et la garde ; `quitter(true)` seulement après « Annuler » confirmé) ; séances jamais analysées reprises à l'ouverture et au retour du réseau (`analyserEnAttente`, `Seance.origine`, 14 jours) ; correction « à vérifier » en cours protégée des redessins (`correctionEnCours` dans `busy`, `verifier` relit le bilan) ; « Annuler cette dictée » limité aux dossiers de la dictée dont les rendez-vous n'ont pas changé depuis (`Recap.apres`) ; deux retours en arrière de suite gardent l'état d'avant le premier (`Copie.posee`) ; lecteurs PDF libérés (`destroy`).
- Transcription en direct (1.5.0, choix de Corentin du 5 novembre 2026) : `enregistrer(direct)` dans `src/transcription.ts` lance à côté de l'enregistrement complet un enregistreur par morceau, relancé à chaque pause (niveau du son suivi par un `AnalyserNode` ; 30 s au moins, 60 s au plus ; `__MUNINN_DIRECT__` raccourcit pour les tests), envoyé aussitôt au PC (jamais à Railway) dans l'ordre ; `texteDirect()` rend le texte à l'arrêt ou `null` (alors transcription complète comme avant). Indice `?indice=` (patients du jour, fin du texte précédent : `indiceVoix`, `suiteDe` dans `src/regles.ts`) relayé par `muninn-pc.mjs` (en-tête `X-Muninn-Indice`) jusqu'à l'invite de `voix.py` ; `nettoyerVoix` (phrases fantômes) et `sansRepetition` côté appli, filtre `no_speech_prob` côté PC. Test : `tests/e2e/direct.spec.ts`.
- Solidité (1.5.1, choix de Corentin du 6 novembre 2026 ; audit M6, M8, F5, F6, F7, F9-d, F10) : erreurs classées par nature (`ErreurIA.nature` : `reseau`, `passager`, `definitif` ; le serveur et `claude.mjs` renvoient `nature`) ; délais côté appli (`DELAI_SERVEUR_MS` 15,5 min, PC 21 min, Railway 6 min) et Claude arrêté côté serveur quand l'appli lâche (`res.on("close")` → `AbortSignal`) ; relances `src/relance.ts` (`Relanceur`, `apresEchec` : 5 min, 3 essais au plus en comptant le premier, au retour du réseau sans connexion, jamais si définitif ; seulement tant que l'appli est ouverte, pas de tâche de fond : Corentin préfère attendre la future solution « le PC fait le travail ») pour le rangement de la dictée, la transcription (dictée et fiche) et la mise au propre des séances. Code d'accès (`server.mjs`) : au-delà de `CODE_ALERTE` (20) mauvais codes en une heure, un examen toutes les 3 s pour tous (l'adresse d'un appareil n'est pas fiable) ; refus des 24 h dans `/api/ia/etat` (`refus`), bandeau dès 3 (`src/alerte-code.ts`, « C'est moi »). `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. Textes trop longs refusés avec un message (`verifierLongueur`, `MAX_DICTEE` 60 000, `MAX_SEANCE` 20 000). Corrections triées par date, patients vus ce jour-là en tête. `navigator.locks` : un travail d'IA par fenêtre, échanges l'un après l'autre. Bilan d'un autre appareil sans résumé depuis 15 min : pris en charge.
- Fondations (1.5.2, choix de Corentin du 7 novembre 2026 ; audit F1, F2, F4, A2, A3, A5, F9-f) : réception du PC réunie dans la transaction d'écriture (`db.recevoirPartage`, F2) ; patient supprimé ailleurs gardé tant qu'une séance y renvoie (F1) ; `quandBloque` (montée de version de la base : la vieille fenêtre ferme sa connexion et demande à être rechargée, F4) ; `modifierDossier` / `modifierRdvs`, `majBilan`, `majSeance` lisent et écrivent dans la même transaction (A3) ; empreinte du texte d'origine (`empreinteTexte`, `memeSource` dans `src/regles.ts`) au lieu de sa copie dans `propre_source`, `bref_source`, `avenir_source`, les deux formes acceptées (A5) ; enregistreur de voix commun `src/enregistreur.ts` (A2). PC (`muninn-pc.mjs` version 6) : 30 copies quotidiennes, suppressions datées (`quand`), effacement définitif après 30 jours de l'ancienne version, des PDF auxquels plus rien ne renvoie (arrivés depuis plus de 2 jours) et des copies « avant-remise » (`purger`, au démarrage puis toutes les 6 h ; `MUNINN_GARDE_JOURS`). Appareils : 7 copies, inchangé. Tests : `tests/unite/pc-garde.test.ts`.
- Archivage (1.5.2, choix de Corentin du 8 novembre 2026) : un patient avec une fin de traitement est archivé (`estArchive` : `fin` notée et aucun rendez-vous après) ; la fin vient du bouton « Fin de traitement » (question « Prochain rendez-vous ? », alerte) ou de la dictée (`fin_traitement` dans les schémas de séance et de dictée, `CONSIGNE_FIN`, ignoré si un rendez-vous est dit ; `moteur.appliquer` note la fin). Caché de la liste (visible seulement dans une recherche, sous « Archivés », après les patients en soins), jamais choisi tout seul par `rattacher` ni proposé à l'IA de la dictée ; jamais effacé. Revient tout seul : rendez-vous posé après la fin, séance ou bilan ajouté après la fin (`db.ajouterSeance`, `ajouterBilan`, `fusionner`) ; « Rouvrir le dossier » sur la fiche ; créer un patient au nom d'un archivé propose de rouvrir (`db.ErreurArchive`). Alerte « sans rendez-vous » dans Ma journée (`sansRendezVous` : 30 jours sans rien et sans rendez-vous à venir, « Fin de traitement » / « Ajouter un rendez-vous » / « C'est normal » qui pose `Dossier.calme` pour 30 jours ; à 90 jours « Archiver » / « Garder »). Dossier complet en PDF depuis les Réglages (`src/export-dossier.ts`, `src/dossier-pdf.ts`). Appareil relié au PC et à jour : plus de rappel « copie hors de Chrome » (« Copies gardées par le PC », `joursPC`). Tests : `tests/e2e/archives.spec.ts`.
- Petit confort (1.5.3, choix de Corentin du 8 novembre 2026) : fenêtres fermées en touchant à côté (`src/fenetres.ts` : clic hors du rectangle du `<dialog>` → son bouton Fermer/Annuler ; saisie en cours (`data-modifie`, sauf recherche et `data-libre`) → « Fermer sans enregistrer ? ») ; « État de l'appli » (`#etatbtn`) rangé en tête des Réglages, la roue `#regbtn` orange avec une pastille quand un point est à voir (tests : `#regbtn` puis `#etatbtn`) ; depuis 1.5.4 la roue est le 4e bouton de la rangée du haut (« + », micro, agenda, roue : `.outils` en 4 colonnes), sur tous les écrans ; choix B de Corentin parmi 4 maquettes ; « rangé d'après le nom seul » dans le récapitulatif de la dictée (`Range.prenomSeul`, audit F11) ; barre du haut de la tablette : Muninn donne bien sa couleur (`theme-color`), mais la tablette Samsung de Corentin la dessine en clair : réglage « Barre du haut de la tablette : Visible / Masquée » (`pleinEcran`, plein écran demandé au premier toucher de chaque ouverture). Tests : `tests/e2e/confort.spec.ts`.
- Sécurité du PC (1.5.5, audit F9 a-c) : `installer.ps1` lance Muninn et Whisper sous « Service local » (S-1-5-19, droit Modifier sur `C:\ProgramData\Muninn`), repli automatique sur SYSTEM s'ils ne démarrent pas (Whisper : erreur sans modèle prêt en 2 min) ; `voix-versions.txt` (`pip freeze` après une installation qui marche, `-c` la fois suivante, sans lui si conflit) ; `voix.py` écrit le son dans `Muninn\temp`, vidé au démarrage. Jamais essayé sur un vrai Windows avant Corentin.
- Navigation (1.5.6, choix de Corentin du 8 novembre 2026) : fiche = étape d'historique (`marquerFiche`, `popstate` → `fermerFiche`, `peutQuitterFiche` si une séance est en cours de frappe) ; téléphone (≤ 820 px) : `body.fiche-ouverte` masque `.side` pour une fiche ou la dictée groupée, retour en haut (`haut()`, `scrollRestoration = "manual"`). Ma journée : jour sans rendez-vous → prochaine journée avec patients (`vueParDefaut`, `suite`, `.jsaut`), 3e bouton nommé d'après ce jour. Tests : `tests/e2e/navigation.spec.ts`.
- Fin du nettoyage de l'audit (1.5.7, choix de Corentin du 8 novembre 2026) : question « Arrêter / Continuer » avant de couper un enregistrement en cours (`laisserMicro` dans `src/app.ts`, `voixSeance.enregistre`, `confirmer(texte, bouton, annuler)`) ; texte de « Revenir à une copie » sur un appareil relié : tous les appareils reviennent en arrière (C1) ; politique de sécurité du contenu dans `server.mjs` (F9-e) ; utilitaires communs `jourLong`, `jourCourt`, `pluriel` (`src/regles.ts`) et `$` (`src/ui.ts`), `hhmm` retiré (A4). PDF des transmissions sans mot de passe (choix de Corentin, F9-h). Restent de l'audit : contrôle « patient oublié » (E3 partie 2, sur de vraies dictées), performances (F8), découpage des grosses dictées seulement si une mesure le justifie (M9), chiffrement du disque du PC (F9-g : vérifié activé par Corentin le 11 novembre 2026).
- Soirée (1.5.8, choix de Corentin du 10 novembre 2026) : à partir de 20 h (`HEURE_SOIR` dans `src/journee.ts`), Ma journée ouvre la prochaine journée avec patients (« Journée terminée : voici demain. ») ; au retour sur l'appli, le passage à 20 h remet la vue par défaut. Bouton de dictée vocale caché quand Whisper n'est pas joignable : gardé tel quel (choix de Corentin).
- Plusieurs rendez-vous dictés (1.6.0, choix de Corentin du 11 novembre 2026) : l'IA rend `rdv_autres` (autres jours, avec leur demi-journée) et `rdv_annules` (jours dits annulés) en plus de `rdv_date` (`CONSIGNE_AUTRES`, `CONSIGNE_ANNULES` dans `src/ia.ts`) ; `moteur.appliquer` pose tous les jours à venir par `poserRdvs` (`src/regles.ts` : un rendez-vous par jour, un jour déjà posé ne change que si matin / après-midi est dit, demi non dite → celle de la séance) ; rien n'est jamais retiré tout seul : les jours dits annulés vont dans `Dossier.retirer` (fusionné élément par élément) et Muninn propose « Enlever » / « Garder » sur la fiche et dans le récapitulatif de la dictée (`prochain.retraits`, `aRetirer`). Tests : `tests/e2e/rdvs-multiples.spec.ts`.
- PC autonome (1.7.0, choix de Corentin du 11 novembre 2026) : `public/pc/lanceur.mjs` est la seule tâche Windows (« Muninn », Service local) ; il fait tourner `muninn-pc.mjs` (version 7) et `voix.py` (version 2, `VERSION` dans le fichier ; `/etat` dit `occupe`), les relance s'ils s'arrêtent, et met à jour ces deux fichiers seul (au démarrage + 2 min puis toutes les 6 h) d'après `public/pc/version.json` servi par Railway (adresse dans `maj.json`, écrit par l'installateur avec `$Installeur`) : téléchargement, numéro et lisibilité contrôlés (`node --check`, `ast.parse`), `.ancien` gardé, redémarrage, réponse attendue 90 s, sinon retour à l'ancienne et version refusée ; Whisper jamais coupé en pleine transcription. `maj-etat.json` (relancer, erreur, faites, refusees) exposé par `/api/sync/etat` (`maj`) et affiché dans Partage avec le PC (`texteMajPC`). Le lanceur lui-même, Python, les droits et la tâche demandent de relancer la ligne (`installeur` ou `lanceur` plus grand dans version.json → « relancer »). Installateur : plus de tâche « Muninn voix », restes des anciens programmes arrêtés, PC jamais en veille sur secteur (`powercfg`). Appareil : heure du plus vieux changement pas encore parti (`localStorage` « partage-attente », `EtatSync.attente`) → bandeau `#alertesync` après 30 min si le PC ne répond pas, « Réessayer ». Tests : `tests/unite/pc-maj.test.ts` (version.json = versions des fichiers), `tests/e2e/pc-joint.spec.ts`. Toujours augmenter `VERSION` (et version.json) à chaque changement de `muninn-pc.mjs` ou `voix.py`.
- Objectifs du patient (1.8.0, choix de Corentin du 12 novembre 2026) : `Resume.objectifs` (objectifs SMART ou écrits ailleurs, demandés à l'IA du bilan) ; `Dossier.objectifs` {liste, maj, source « bilan » | « main » | « dictee »}, `objectifs_hist` (10), `objectifs_propose` ; `objectifsDe` (dossier, sinon bilan le plus récent : champ `objectifs` ou rubrique « Objectifs… ») et `avecObjectifs` dans `src/regles.ts` ; encadré en haut de la fiche et proposition « Remplacer / Ajouter / Ignorer » (fiche et récapitulatif de la dictée) dans `src/objectifs.ts` ; l'IA des séances rend `objectifs` (`CONSIGNE_OBJECTIFS`), `moteur.appliquer` ne fait que proposer. Transmissions allégées (même date) : par patient, rendez-vous, bilan (coup d'œil + chiffres + rubriques identité, diagnostic, EVA : `rubriquesTransmission` ; pas l'histoire clinique, l'anamnèse, les red / yellow flags), dernière séance mise au propre sans la ligne « À venir » (`seanceTransmission`), objectifs du patient et « Pour la prochaine séance ». Tests : `tests/e2e/objectifs.spec.ts`, `tests/e2e/transmissions.spec.ts`.
- **Mise en production : seulement sur un « mets en production » explicite de Corentin, à chaque fois**, après lui avoir montré la version (captures). L'envoi automatique du 5 novembre était une exception ponctuelle. Script d'envoi : il vérifie les codes de sortie des tests (jamais un `grep` qui laisse passer un échec).
- Avant chaque envoi : `npm test` (194 tests) et `npm run test:e2e` (88 tests) doivent passer.
