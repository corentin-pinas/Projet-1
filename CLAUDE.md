# CLAUDE.md — Appli de suivi patients (kinésithérapie)

> **Point de reprise le plus récent : `REPRISE.md`** (état au 10 octobre 2026, décisions, prochaines étapes).

Contexte repris du travail fait dans claude.ai (projet « Gestion Patient assistée »), le 2 octobre 2026.
Source complète : `reference/contexte-claude-ai.pdf`. Code de la version d'essai : `reference/bilans-seances-essai.html`.

## L'utilisateur

- Corentin, kinésithérapeute en cabinet à Toulouse. Prise en charge surtout orientée épaule.
- **Ne sait pas coder et ne relit pas la technique.** Il laisse les choix d'architecture à Claude et veut être guidé de bout en bout.
- Il dicte ses messages à la voix : attendre des phrases orales, parfois approximatives.
- Matériel : tablette Android au cabinet (navigateur Brave, usage en paysage), téléphone en complément.
- **Brave refuse la protection du stockage** (`navigator.storage.persist()` renvoie faux, constaté le 2 octobre 2026 sur sa tablette). L'appli doit être installée avec Chrome, qui l'accorde aux applis installées. Corentin peut continuer à naviguer avec Brave.
- **Pas d'ordinateur** : il fait tout sur la tablette et le téléphone, y compris les réglages (GitHub, Railway, compte IA). Toutes les marches à suivre doivent être faisables sur tablette Android. Passer sur ordinateur n'est envisagé que si un projet l'impose vraiment.
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
- **Voix** : micro du clavier pour commencer ; transcription audio par un service dédié envisagée plus tard (Corentin prévoit d'autres applis à commande vocale).

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
- **Transmissions** (7 octobre 2026) : un bouton qui, pour une période choisie (une semaine, quinze jours…), résume tous les patients ayant rendez-vous dans la période, pour un remplaçant : pathologie, état à l'arrivée, traitement en cours. Sortie : un **PDF** que Corentin envoie par message (le remplaçant l'imprime s'il veut).
- **Agenda** (7 octobre 2026) : une vue d'ensemble de l'emploi du temps dans l'appli (Maiia et Doctolib ne sont pas reliés), pour repérer les trous anormaux et ajouter un patient dans un créneau. Sert à fiabiliser les transmissions sur 15 jours ; de petits écarts ensuite sont acceptables.

## Lecture des bilans manuscrits

Bilans mixtes (tapé et manuscrit au stylet). Conventions : MVT = mouvement ; « + » entouré = test positif ; « − » entouré = négatif ; rond barré = non fait ; grande croix ou rond barré sur une partie (ex. EVA) = non évalué car non pertinent. Devant une abréviation inconnue, proposer une interprétation et la signaler dans « à vérifier ».

## Code (version autonome)

- Plan validé : `PLAN.md`. Étape en cours suivie dans ce fichier et sur la carte du projet (https://claude.ai/artifact/7vULqC1G8oPWJv1P8w5ZHb).
- Appli web installable (PWA) : Vite + TypeScript, sans framework. `vite-plugin-pwa` pour le hors-connexion. Police Atkinson Hyperlegible hébergée avec l'appli.
- Couleurs uniquement via les variables CSS de `src/styles.css` (palettes et thème à venir).
- Commandes : `npm run dev` (développement), `npm test` (règles métier, Vitest), `npm run test:e2e` (écrans en largeur tablette, Playwright ; Chromium dans `/opt/pw-browsers/chromium` en session cloud), `npm run build` (vérifie les types puis construit `dist/`), `npm run icons` (régénère les icônes PNG depuis `public/icons/icon.svg`).
- Mise en ligne : Railway (choix de Corentin, 5 €/mois, un collègue le connaît). Railway lance `npm run build` puis `npm start` (`server.mjs`, serveur Node sans dépendance qui livre `dist/`). Réglages dans `railway.json`. Aucune donnée patient ne doit jamais être stockée sur le serveur (Railway n'est pas certifié HDS).
- Structure : `src/regles.ts` (règles métier pures, reprises de la version d'essai), `src/db.ts` (IndexedDB : dossiers, bilans, séances, fichiers), `src/app.ts` (écrans), `src/main.ts` (démarrage, état de l'appli, mises à jour), `src/ui.ts` (messages, confirmation), `src/pdf.ts` (lecteur PDF chargé à la demande).
- Modèle de données de la version autonome : un dossier porte le nom affiché, les rendez-vous et le drapeau `homonyme` ; bilans et séances y sont rattachés par `dossierId`. Supprimer le dernier bilan d'un dossier supprime le dossier et ses séances (confirmation explicite).
- `pdfjs-dist` figé en 4.10.38 : la 6.x utilise `Map.getOrInsertComputed`, absent de Chrome < 145.
- Mises à jour en mode « prompt » : bandeau « Mettre à jour », jamais de rechargement automatique (ne pas perdre une dictée en cours).
- IA (étape 3) : `src/ia.ts` (appels, prompts, garde-fous ; SDK `@anthropic-ai/sdk` appelé depuis le navigateur avec `dangerouslyAllowBrowser`, la clé de Corentin rangée dans le store `parametres`), `src/moteur.ts` (résumés automatiques en file, analyse des séances, consommation du mois). Modèle `claude-opus-5-5` (4 $ / 20 $ par million de jetons), repli `fallbacks: "default"` en cas de refus, sortie JSON imposée par `output_config.format`. Effort `high` pour les bilans (lecture du manuscrit), `medium` pour les séances. Les corrections « à vérifier » sont renvoyées à l'IA dans le prompt des bilans suivants.
- **IA par l'abonnement (version 0.4, mode principal)** : mécanisme décrit dans `reference/mecanisme-abonnement-claude-code.md`, adapté à « tablette + serveur Railway ». Claude Code (dépendance npm `@anthropic-ai/claude-code`) tourne sur le serveur, connecté à l'abonnement Claude de Corentin. `serveur/claude.mjs` : recherche de l'exécutable, état (`--version`, `auth status`), connexion sans terminal (`auth login --claudeai`, lien relayé à la tablette, code renvoyé sur l'entrée standard), et travail : `claude -p --input-format stream-json --output-format stream-json --json-schema … --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources "" --no-session-persistence --model opus --effort …`, demande (texte, PDF, images) sur l'entrée standard, réponse lue dans `structured_output` de la ligne `result`. Une seule génération à la fois, 5 minutes au plus, arrêt du seul processus lancé et de ses enfants. Écart assumé avec le document : pas de serveur MCP, car un seul document entre et un seul JSON sort ; sans aucun outil, c'est encore plus verrouillé.
- Règles : le jeton de connexion de Claude Code n'est jamais lu ni transmis ; Claude Code reçoit un environnement minimal (ni clé API, ni `CODE_ACCES`). Les routes `/api/ia/*` exigent le code d'accès (`Authorization: Bearer`, variable Railway `CODE_ACCES`, 12 caractères au moins ; 5 erreurs = 10 minutes de blocage). La connexion de Claude Code est gardée dans un volume Railway monté sur `/data` (`CLAUDE_CONFIG_DIR=/data/claude` par défaut si `/data` existe).
- Confidentialité : en mode abonnement, le bilan ou le texte de séance transite par le serveur Railway (en mémoire, le temps de la demande, jamais écrit sur disque) avant d'aller chez Anthropic.
- Clé API : secours, verrouillée par défaut (`api_autorisee`), choisie par `mode_ia`. Réglages dans `src/reglages-ia.ts`.
- Les tests d'écran simulent l'API Anthropic (`page.route`) et Claude Code (`tests/faux/claude.mjs`, via `CLAUDE_BIN`) : aucune vraie requête n'est faite dans les tests.
- Avant chaque envoi : `npm test` et `npm run test:e2e` doivent passer.
