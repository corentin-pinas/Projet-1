# Reprise du projet — appli de suivi patients (kiné)

Point de reprise du **29 octobre 2026** (mis à jour le soir : version 0.9.4 en production), à lire en premier pour démarrer une nouvelle conversation sans perte de contexte.
À lire ensuite : `CLAUDE.md` (contexte détaillé, règles de travail, technique ; certaines parties décrivent encore la version d'essai claude.ai) et `PLAN.md` (plan d'origine).
Carte du projet (artifact) : https://claude.ai/artifact/7vULqC1G8oPWJv1P8w5ZHb — pas mise à jour depuis plusieurs étapes.

## 1. Qui et comment travailler

- **Corentin**, kinésithérapeute à Toulouse (surtout l'épaule). Il ne code pas et ne relit pas la technique : Claude choisit, explique ce qui change **à l'écran**, dit franchement ce qui n'est pas testé.
- Il **dicte à la voix** (phrases orales, parfois approximatives, parfois envoyées deux fois : un message répété n'est pas une nouvelle demande).
- Réponses en français, sans jargon, **en commençant par le résultat**. Une illustration (schéma, maquette, capture) à chaque point de plan. Il apprécie les **captures d'écran à la taille de sa tablette** (d'après ses captures du 29 octobre : environ **1690 × 1000 en paysage**, 1060 × 1690 en portrait ; il y a donc une marge vide de chaque côté de l'appli en paysage) envoyées avec `SendUserFile`.
- **Tablette Android + téléphone, pas encore d'ordinateur** (un PC arrive bientôt). L'appli est **installée avec Chrome** (Brave refuse la protection du stockage).
- Règles d'or : lui faire gagner du temps ; **ne jamais casser une version qui fonctionne** ; **ne jamais mettre en production sans son accord explicite** (il répond « mets en production »).
- Il a un compte **Railway payant** et reçoit les mails de Railway ; il peut envoyer des captures des « Deploy Logs ».

## 2. Dépôt, branches, mise en production

- Dépôt : `corentin-pinas/Projet-1` (GitHub).
- **Branche de travail** de la dernière session : `ccr-5fa8a3ae-zcpk2o`. **Branche de production** (déployée par Railway à chaque push) : `claude/patient-management-planning-xg8y6k`.
- Méthode suivie à chaque changement :
  1. coder sur la branche de travail ; `npm test` et `npm run test:e2e` au vert ;
  2. monter la version dans `package.json` (puis `npm install --package-lock-only`) ;
  3. commit + push sur la branche de travail ;
  4. présenter à Corentin (captures) et **attendre son « oui »** ;
  5. relancer les tests, puis avancer la production en avance rapide : `git push origin HEAD:claude/patient-management-planning-xg8y6k` (vérifier d'abord `git merge-base --is-ancestor`).
- Pas de pull request sans demande.
- **Les deux branches sont au même commit** au 29 octobre au soir (version **0.12.3** en production le 30 octobre : création de patient depuis la dictée, transmissions, agenda en demi-journées, accueil épuré en colonne, icônes), à part ce fichier.

## 3. Ce que fait l'appli (version 0.9.4, en production)

PWA (Vite + TypeScript, sans framework), données **dans la tablette** (IndexedDB), serveur Railway sans aucune donnée patient.

- **Liste** à gauche : patients classés par rendez-vous (Aujourd'hui, Demain, jours suivants, sans rendez-vous), recherche ; « Bilan à venir » pour les patients sans bilan ; créer un patient depuis la recherche (« Créer le patient « Paul G. » (bilan à venir) »).
- **Bilans** (PDF ou photos) : nom tiré du fichier (prénom composé gardé : « Marie-Laure D. » ; particules « Le Goff » → « L. ») ; **résumé automatique par l'IA** (coup d'œil, chiffres, rubriques, points « à vérifier ») ; **une correction « à vérifier » est reportée dans le résumé** (IA légère) ; visionneuse ; « Ajouter le bilan » sur la fiche d'un patient sans bilan ; « Modifier le nom ».
- **Séances** : dictées (micro du clavier), mises au propre par l'IA en rubriques (État du patient, Fait en séance, À faire à la maison, Autres notes, À venir), « À venir » en tête de fiche, rendez-vous dicté placé tout seul.
- **Dictée groupée** (🎙️) : toute la matinée d'un bloc, une seule demande à l'IA la plus puissante, rangement automatique par patient, question seulement en cas de doute, « Annuler cette dictée ». Date Aujourd'hui / Hier / autre. Bouton « Enregistrer ma dictée » **prêt pour Whisper** mais caché tant que Whisper n'est pas branché.
- **Agenda** (📅) : semaine en colonnes, séance 20 min, bilan 40 min, créneaux libres en orange d'après « Mes horaires », toucher un patient → sa fiche, toucher un créneau → y placer un patient existant ou nouveau.
- **Rendez-vous** : « Séance » ou « Bilan » ; plusieurs possibles, un par jour.
- **Homonymes** : « même personne ? ».
- **Sauvegarde** : copie interne automatique chaque jour (7 gardées, retour en arrière annulable) ; **copie hors de Chrome** chiffrée dans « Téléchargements » (mot de passe retenu par la tablette, à noter sur papier), restauration depuis le fichier, rappel orange après 7 jours.
- **État de l'appli** : installation, hors-connexion, protection du stockage, place, IA (abonnement / clé API de secours), copies de sécurité.
- **Réglages** (⚙️) : fond (tablette / clair / sombre), **12 couleurs** (Muninn — bleu nuit / nuit et lune dorée, couleur d'origine depuis 0.9.4 —, vert, turquoise, bleu, indigo, violet, framboise, rouge, orange, or, café, ardoise ; fond assorti en sombre), taille du texte (3), **8 écritures**, contraste fort, décorations de saison oui/non. Gardés dans la tablette (`localStorage`).
- **Muninn, le petit corbeau, sur son perchoir** (0.9.4 ; le petit kiné a été retiré à la demande de Corentin) : emblème et seule mascotte, style rond « kawaii » choisi par Corentin, présent en toute saison avec le chapeau de saison ; cligne des yeux, gestes tout seul toutes les 20 à 50 s (penche la tête, regarde autour, s'ébroue, sautille, croasse), parfois un tour en vol à travers l'appli puis retour au perchoir ; au toucher : « Croâ ! », battement d'ailes, envol. Dans la marge gauche en paysage large, à côté du titre sinon.
- **Décorations de saison** : Halloween (24 oct.–1er nov. : toiles, araignée qui remonte quand on la touche, chauve-souris, chapeau de sorcière) ; **Noël tout décembre en 5 niveaux** (flocons → guirlande → bonnet → neige au sol, sapin, cadeaux → étoile, 🎅 du 24 au 26) ; **Pâques** (Rameaux → lundi de Pâques : œufs, lapin qui saute au toucher, oreilles de lapin) ; **anniversaire de Corentin** (10–16 mars, confettis, ballons, chapeau de fête, « Joyeux anniversaire Corentin ! » le 13 mars, prioritaire sur Pâques).
- Mises à jour par un bandeau « Mettre à jour », jamais de rechargement automatique.

## 4. Historique des versions

| Version | Date | Contenu |
|---|---|---|
| 0.4.3 | 8 oct. | IA par l'abonnement, bilans au stylet, niveaux d'IA (début de l'usage réel) |
| 0.5.0 | 25 oct. | Copies de sécurité internes |
| 0.5.1 | 25 oct. | Copie hors de Chrome chiffrée + restauration |
| 0.5.2 | 25 oct. | Liste : patients qui se chevauchaient quand la liste dépasse l'écran |
| 0.5.3 | 26 oct. | Serveur : ne tombe plus si Claude Code quitte avant d'avoir lu (EPIPE) |
| 0.6.0 | 26 oct. | Dictée groupée |
| 0.6.1 | 26 oct. | Fin des faux mails « Deploy Crashed » (serveur lancé par `node server.mjs`, arrêt propre sur SIGTERM) |
| 0.6.2 | 26 oct. | Corrections reportées dans le résumé ; prénoms composés ; « Modifier le nom » |
| 0.7.0 | 28 oct. | Agenda, patients sans bilan, dictée enregistrée prête pour Whisper |
| 0.8.0 | 29 oct. | Réglages, 11 couleurs, 8 écritures, petit kiné, Halloween |
| 0.8.1 | 29 oct. | Noël progressif, Pâques, anniversaire, chapeaux du petit kiné |
| 0.9.0 | 29 oct. | Écran d'accueil « Ma journée »  |
| 0.9.1 | 29 oct. | L'appli s'appelle **Muninn** (« la mémoire du cabinet », corbeau d'Odin) : titre, nom à l'installation, icône corbeau ; araignée d'Halloween décalée (elle cachait le titre). En production le 29 oct. |
| 0.9.2 | 29 oct. | Corbeau redessiné (bec long et droit, gorge ébouriffée, queue en pointe) ; **Muninn, le petit corbeau, remplace le petit kiné** comme mascotte toute l'année (chapeaux de saison, écharpe aux couleurs choisies) : gestes tout seuls toutes les 20 à 50 s (penche la tête, regarde derrière, sautille, s'ébroue, parfois un tour en vol au-dessus du titre), et au toucher : « Croâ ! », saut, battement d'ailes. En production le 29 oct. |
| 0.9.3 | 29 oct. | Sur les images choisies par Corentin : **corbeau rond « kawaii »** de face (grands yeux brillants, bec jaune, joues roses, pattes orange) pour l'icône et la mascotte ; **le petit kiné revient**, plus grand, avec le corbeau posé sur son épaule (deux personnages qui réagissent chacun au toucher) ; en paysage sur grand écran, les deux s'installent dans la marge vide à gauche (150 px). Chauve-souris d'Halloween réparée (cassée par erreur en 0.9.2). En production le 29 oct. |
| 0.9.4 | 29 oct. | **Le corbeau seul** (le petit kiné est retiré, choix de Corentin : « c'est le corbeau, notre emblème ») sur un **perchoir** en bois, avec les chapeaux de saison ; tour en vol à travers l'appli puis retour au perchoir ; **nouvelle couleur « Muninn »** (bleu nuit en clair, nuit et lune dorée en sombre), couleur d'origine à la place du vert ; icône « nuit et lune » avec le corbeau sur sa branche. En production le 29 oct. |
| 0.9.5 | 29 oct. | Barre du haut d'Android (heure, batterie) à la couleur du fond de l'appli (et non plus de la couleur principale) ; couleurs de l'appli installée (barres, écran de démarrage) en nuit `#110F1A` ; « Ma journée » : plus de demi-ligne qui dépasse sous les « … ». En production le 29 oct. |
| 0.10.0 | 30 oct. | **Transmissions pour un remplaçant** : bouton « Transmissions » dans l'Agenda ; période (semaine prochaine par défaut, 1 à 3 semaines, dates libres), patients ayant rendez-vous cochés (décochables), jours travaillés sans rendez-vous signalés, mot pour le remplaçant gardé ; PDF fabriqué dans la tablette **sans IA** (fidèle) : planning jour par jour, puis une fiche par patient à la suite (rendez-vous, prévu pour la suite, bilan complet résumé, deux dernières séances) ; « Envoyer le PDF » ouvre le partage d'Android, « Enregistrer » le met dans Téléchargements. Pas encore en production |
| 0.11.0 | 30 oct. | **Agenda en demi-journées** (demande de Corentin : plus d'heure précise) : rendez-vous « matin » ou « après-midi » (`Rdv.p`, l'ancienne heure sert seulement à ranger), agenda de la semaine en blocs matin / après-midi avec places libres d'après « Mes horaires » (séance 20 min, bilan 40) et « + Ajouter » ; fiche, liste, Ma journée (groupes Matin / Après-midi, plus de « À suivre »), dictée (l'IA rend `rdv_demi`), transmissions. Pas encore en production |
| 0.12.0 | 30 oct. | **Accueil épuré** : la liste de tous les patients est cachée derrière « 📋 Liste des patients » (ouverte ou fermée, gardé dans la tablette ; la recherche l'affiche) ; « Ma journée » montre la **demi-journée en cours** (le matin vide : l'après-midi), boutons Matin / Après-midi / Demain avec le nombre de patients, fiches plus grandes (2 colonnes, prévu sur 6 lignes). Corrigés : les boutons répondent dès l'ouverture (un dépôt très rapide pouvait être ignoré) ; un message de connexion à l'abonnement pouvait être écrasé par une vérification en retard ; premier patient créable depuis la recherche quand l'appli est vide. Pas encore en production |
| 0.12.1 | 30 oct. | Colonne étroite à gauche (250 px) : le corbeau en grand en haut, « Muninn » et tous les boutons dessous ; l'appli prend toute la largeur de l'écran ; « Ma journée » sur 3 colonnes en paysage (2 en portrait). Pas encore en production |
| 0.12.2 | 30 oct. | Boutons en icônes (demande de Corentin) : « + » (ajouter des bilans), micro (dictée groupée), calendrier (agenda) sur une ligne, « Patients » pour la liste, roue dentée pour les réglages ; noms gardés pour l'accessibilité et en info-bulle. **En production le 30 oct.** (avec 0.10.0 à 0.12.1) |
| 0.12.3 | 30 oct. | Dictée groupée : un patient pas encore dans l'appli (bilan pas ajouté) peut être **créé depuis le passage à ranger** (nom dicté proposé, modifiable, initiale exigée), « bilan à venir », et le passage y est rangé ; « Annuler cette dictée » retire aussi ces patients s'ils n'ont rien reçu d'autre. **En production le 30 oct.** |

## 5. Décisions prises (à ne pas remettre en question)

1. **Tablette seule** ; données patients dans la tablette. Serveur Railway = livrer l'appli + relayer l'IA, rien n'y est stocké.
2. **IA par l'abonnement Claude Pro** de Corentin : le serveur lance Claude Code (verrouillé, sans outils). Clé API = secours verrouillé. IA puissante (opus) pour bilans et dictée groupée, légère (sonnet) pour séances et report des corrections.
3. **Sauvegarde** : interne + copie hors de Chrome (pas de Drive). Corentin accepte le risque de perte de la tablette jusqu'au passage au PC (qui aura sa propre sauvegarde).
4. **Dictée** : le clavier Samsung fait perdre trop de temps ; la dictée de l'appli Claude n'est pas utilisable par une autre appli. **Décision : Whisper à l'arrivée du PC** (comme l'appli d'un ami). L'appli est déjà câblée (voir § 7).
5. **Rattachement dans la dictée groupée** (règle souple) : un seul dossier possible parmi les rendez-vous du jour, sinon un seul dossier de ce nom dans toute l'appli → rangé seul ; sinon on demande. Corentin dicte le prénom, parfois avec l'initiale, jamais le nom de famille.
6. **Agenda** : séance 20 min, bilan 40 min ; Corentin règle lui-même ses horaires dans « Mes horaires » (défaut lun.–ven. 8 h–12 h / 14 h–19 h).
7. **Confidentialité** : prénom + initiale, âge sans date de naissance, médecin par sa spécialité, pas de nom complet (voir `CLAUDE.md`).
8. Volume : 3 à 8 bilans et 80 à 110 séances par semaine.

## 5 bis. Partage entre appareils (discussion du 30 octobre)

- Corentin veut utiliser Muninn sur tablette, téléphone et ordinateur avec les mêmes dossiers.
- Conseillé : **l'ordinateur du cabinet (ou un NAS à lui) garde les dossiers**, chaque appareil garde une copie et se synchronise (Wi-Fi au cabinet, Tailscale ailleurs). Écarté : un compte en ligne (hébergeur HDS obligatoire). Le NAS du père de Corentin : déconseillé pour des dossiers patients (chez un tiers, qui en a l'accès).
- 30 octobre : Corentin confirme. **Pas de NAS pour l'instant** (possible plus tard s'il en achète un). Le PC, peut-être à la maison, restera allumé et sera joint de partout (Tailscale), vacances comprises.
- Décision provisoire : **attendre l'ordinateur (début décembre)**, tout continue sur la tablette d'ici là. Le serveur de synchronisation sera écrit pour tourner aussi bien sur un PC que sur un NAS (Docker).
- Questions posées, sans réponse : Windows ou Mac ? accès hors du cabinet ? seul utilisateur ?

## 6. Pas encore testé en conditions réelles

- Icône, nom et barre du bas de l'appli installée : Android ne les met à jour qu'au moment où Chrome régénère l'appli (vérification au plus une fois par jour au lancement depuis l'icône, avec parfois une question « mettre à jour ? »). Au 29 octobre au soir : encore l'ancienne icône verte « Mes patients » et la barre du bas verte.

- Copie hors de Chrome : le fichier arrive-t-il bien dans « Téléchargements », et le sélecteur Android permet-il de le choisir pour restaurer ?
- Dictée groupée sur une vraie matinée : qualité du découpage, durée (limite serveur 5 min), consommation du quota Pro.
- Report des corrections dans le résumé avec la vraie IA.
- Agenda au doigt (retour du 29 octobre : « ça a l'air très bien, pas de bug »).
- Réglages, mascotte et décorations sur la tablette (Noël, Pâques, anniversaire seulement simulés en changeant la date dans les tests).

## 7. Prochaines étapes (dans l'ordre conseillé)

1. **Écran d'accueil « Ma journée »** — fait en 0.9.0, en production depuis le 29 octobre (avec 0.9.4). `src/journee.ts`, règles `journee`, `prochaineJournee`, `brefDe` ; champ `bref` (+ `bref_source`) demandé à l'IA avec la mise au propre (séance seule et dictée groupée) ; sans lui, « État du patient » + « Fait en séance » coupés à 160 caractères. Boutons Aujourd'hui / Demain, fiche « À suivre », fiches déjà notées grisées, « ← Ma journée » en haut de chaque fiche. Idée d'origine : à l'ouverture, à la place de « Choisissez un patient », les patients du jour en **petites fiches** dans l'ordre des rendez-vous : heure, nom, séance ou bilan, pathologie (région du bilan), **ce qui est prévu aujourd'hui** (« À venir » de la dernière séance), **résumé court de la séance d'avant**. Toucher une petite fiche → la vraie fiche. Pas d'IA en plus, sauf un résumé court de chaque séance à produire en même temps que la mise au propre.
2. **Transmissions en PDF** — faites en 0.10.0 (`src/transmissions.ts`, `src/transmissions-pdf.ts` avec jsPDF chargé à la demande, règles `transmissions`, `joursSansRdv`, `semaineProchaine`). Choix : pas d'IA (fidélité, rapidité, pas de quota) ; une synthèse par l'IA reste possible si Corentin la demande. Idée d'origine : pour une période choisie (une semaine, quinze jours…), tous les patients ayant rendez-vous : pathologie, état à l'arrivée (bilan), traitement en cours (séances). PDF envoyé par message. L'agenda sert à vérifier qu'aucun patient ne manque.
3. **Whisper**, quand le PC est là : choisir Whisper sur le PC (gratuit, la voix ne sort pas du cabinet ; il faudra que le serveur Railway puisse le joindre : adresse publique ou tunnel) ou l'API d'OpenAI (voix envoyée aux États-Unis). Il suffira de régler les variables Railway `WHISPER_URL` (+ `WHISPER_CLE`, `WHISPER_MODELE`) : le bouton « Enregistrer ma dictée » apparaîtra tout seul.
4. Idées proposées, non demandées : le petit kiné comme **icône de l'appli** sur l'écran d'accueil de la tablette ; d'autres fêtes.
5. Plus tard (idées de Corentin) : résumé en tête de fiche (EVA, observance, exercices), suivi des exercices à domicile, clôture de prise en charge, schéma corporel des douleurs, lecture d'un dossier de bilans, propositions de séance appuyées sur la littérature, version PC.

## 8. Repères techniques (détails dans `CLAUDE.md`)

- Fichiers principaux : `src/app.ts` (liste, fiche ; sélection par dossier `selD` / bilan `selB`), `src/db.ts` (IndexedDB, base version 3, copies, export/import, `creerPatient`, `supprimerPatient`), `src/regles.ts` (règles pures : noms, rendez-vous, `rattacher`, agenda), `src/ia.ts` (prompts, garde-fous : `resumerBilan`, `analyserSeance`, `decouperDictee`, `corrigerResume`), `src/moteur.ts` (files d'attente IA), `src/dictee.ts`, `src/agenda.ts`, `src/copies.ts`, `src/fichier-copie.ts`, `src/transcription.ts`, `src/reglages.ts`, `src/palettes.ts`, `src/saisons.ts`, `src/mascotte.ts`, `server.mjs`, `serveur/claude.mjs`, `serveur/transcription.mjs`.
- Tests : `npm test` (Vitest, 102 tests) et `npm run test:e2e` (Playwright, 43 tests, Chromium `/opt/pw-browsers/chromium`, faux Claude Code `tests/faux/claude.mjs`, faux Whisper `tests/faux/whisper.mjs`, micro simulé). Dans les tests d'écran, `page.clock.setFixedTime(...)` fixe la date (utile pour l'agenda et les saisons).
- Si `node_modules` manque dans une nouvelle session : `npm ci`.
- Captures pour Corentin : un test Playwright temporaire `tests/e2e/zz-capture.spec.ts` (viewport 1000 × 625), à supprimer ensuite ; fichiers dans le dossier scratchpad.
- Railway : `railway.json` lance `node server.mjs` (surtout pas `npm start`, qui faisait envoyer de faux mails « Deploy Crashed » à chaque mise en ligne). Variables : `CODE_ACCES`, volume `/data` (connexion de Claude Code), et plus tard `WHISPER_URL`.
- Le serveur bloque la caméra et la géolocalisation ; le micro est autorisé pour l'appli elle-même (`microphone=(self)`).
