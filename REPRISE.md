# Reprise du projet — appli de suivi patients (kiné)

Point de reprise rédigé le 10 octobre 2026, pour démarrer une nouvelle conversation Claude Code.
À lire avec `CLAUDE.md` (contexte détaillé, règles de travail, technique) et `PLAN.md` (plan validé).
Carte du projet, à mettre à jour à chaque point d'étape : https://claude.ai/artifact/7vULqC1G8oPWJv1P8w5ZHb

## Qui et comment

- **Corentin**, kinésithérapeute à Toulouse (surtout l'épaule). Il ne code pas et ne relit pas la technique : je choisis, j'explique ce qui change à l'écran, je dis ce qui n'est pas testé.
- Il dicte à la voix, en français. Il veut des réponses sans jargon, qui commencent par le résultat, et une **illustration (schéma, maquette) à chaque point de plan**.
- **Uniquement tablette Android et téléphone, pas d'ordinateur** : toutes les marches à suivre (Railway, GitHub, comptes) doivent se faire sur tablette.
- Règle d'or : lui faire gagner du temps ; ne jamais casser une version qui fonctionne.
- Dépôt : `corentin-pinas/Projet-1`, branche de travail `claude/patient-management-planning-xg8y6k` (aussi branche de production sur Railway). Pas de pull request sans demande.

## Ce que fait l'appli (version 0.4.3, en usage réel au cabinet depuis le 8 octobre)

Appli web installable (PWA) sur la tablette, **installée avec Chrome** (Brave refuse la protection du stockage).

- **Liste du jour** classée par rendez-vous (Aujourd'hui, Demain, jours suivants, puis sans rendez-vous), recherche.
- **Bilans** : dépôt de PDF ou de photos. Le nom du patient (prénom + initiale) est tiré du nom du fichier. **Résumé automatique par l'IA** : coup d'œil, chiffres, rubriques, points « à vérifier » validables ou corrigeables. Les corrections sont renvoyées à l'IA pour les bilans suivants. Visionneuse du bilan complet.
- **Bilans au stylet** : sa trame PDF est tapée puis remplie au stylet. Chaque page est dessinée sur la tablette, écriture comprise, et envoyée en image à l'IA, avec le texte tapé à part. Vérifié : un trait de stylet apparaît bien dans l'image.
- **Séances** dictées avec le micro du clavier, mises au propre par l'IA en rubriques (État du patient, Fait en séance, À faire à la maison, Autres notes, À venir). Le texte d'origine reste consultable. Encadré « À venir ». Rendez-vous dicté placé tout seul.
- **Homonymes** : question « même personne ? » (réunir, ou ajouter la 2e lettre du nom).
- **État de l'appli** : installation, hors-connexion, protection du stockage, place, IA. Réglages de l'IA. Les messages s'affichent dans la fenêtre.
- **Mises à jour** proposées par un bandeau, jamais de rechargement automatique.

## Décisions prises (dans l'ordre)

1. **Tablette seule** ; les données patients restent dans la tablette (IndexedDB). Pas de serveur qui les stocke.
2. **Résumé automatique** des bilans dès le dépôt.
3. **On est reparti de zéro** : les anciens bilans de test ont été supprimés par Corentin ; il dépose désormais de vrais bilans pseudonymisés.
4. **D'abord à l'identique** de la version d'essai claude.ai, puis les idées une par une.
5. **Hébergement : Railway** (5 €/mois, un collègue le connaît). Variable `CODE_ACCES` réglée ; **volume monté sur `/data`** (garde la connexion de Claude Code).
6. **IA par l'abonnement Claude Pro de Corentin** (demande du 7 octobre, d'après son document `reference/mecanisme-abonnement-claude-code.md`) : la tablette envoie au serveur Railway, qui lance **Claude Code** (CLI officiel) connecté à l'abonnement, verrouillé (aucun outil, aucun connecteur, rien de conservé, réponse au format imposé). Connexion faite depuis la tablette, **fonctionnelle**. La clé API reste un secours **verrouillé par défaut**.
7. **Niveaux d'IA** : la plus puissante (opus) pour les **bilans** et la future **dictée groupée** ; une plus légère (sonnet) pour les **séances**. Si le quota Pro ne suffit plus : passage à l'abonnement Max, sans rien changer à l'appli.
8. **Confidentialité** : prénom + initiale, âge sans date de naissance, médecin par sa spécialité, etc. (voir CLAUDE.md). En mode abonnement, le contenu transite par Railway en mémoire, sans y être gardé.
9. **Volume habituel** : 3 à 8 bilans et 80 à 110 séances par semaine.

## Étapes

| # | Étape | État |
|---|---|---|
| 1 | Socle installable, hors-connexion | Fait |
| 2 | Reproduction de la version d'essai | Fait |
| 3 | IA branchée (abonnement, stylet, niveaux d'IA) | Fait, en usage |
| 4 | **Sauvegarde** | **Prochaine, en attente du « go » de Corentin** |
| 5 | Dictée groupée | À faire |
| 6 | Agenda | À faire (maquette validée, deux questions ouvertes) |
| 7 | Transmissions en PDF | À faire |
| 8 | Ses autres idées, une par une | Plus tard |

## Étape 4 — sauvegarde (conception validée par Corentin)

- **Copie automatique chaque jour** dans la tablette, **texte seulement** (dossiers, bilans sans leurs fichiers, résumés, séances, rendez-vous, corrections). **Rotation : 7 copies gardées, la plus ancienne effacée automatiquement.** Place occupée affichée dans « État de l'appli ». Sert à revenir en arrière après une fausse manœuvre.
- **Fichier hebdomadaire complet** (texte + PDF et photos des bilans) : compressé puis chiffré (AES-GCM, clé dérivée du mot de passe, PBKDF2) avec un **mot de passe choisi par Corentin** (s'il le perd, la sauvegarde est perdue : le lui dire). Nom du type `mes-patients-AAAA-MM-JJ.sauvegarde`. Envoi par le menu de partage Android (Web Share API avec fichier : Drive, messagerie…). Un **bandeau de rappel** apparaît si la dernière sauvegarde a plus de 7 jours.
- **Restauration** depuis le fichier + mot de passe, sur une tablette neuve, testée de bout en bout avant livraison.
- Taille annoncée : 1 à 3 Mo par bilan, ~50 Mo à 3 mois, quelques centaines de Mo à un an. Plus tard si besoin : sauvegarde des seules nouveautés.

## Étape 6 — agenda (maquette validée)

- Vue semaine en colonnes. **Séance = 20 minutes ; bilan = 40 minutes** (deux créneaux). Au moment d'ajouter un rendez-vous : « Séance » ou « Bilan ».
- **Toucher un patient ouvre sa fiche** ; toucher un trou permet d'y placer un patient.
- Trous anormaux en orange, d'après ses horaires habituels.
- Le modèle de rendez-vous doit gagner une durée ou un type (aujourd'hui `{d, h}`, un par jour et par patient au plus).
- **Questions en attente** : (1) ses horaires jour par jour avec la pause de midi ; (2) accord pour **créer un patient depuis l'agenda** (prénom + initiale, « bilan à venir »), le PDF déposé ensuite rejoignant son dossier.

## Étape 7 — transmissions

- Pour une période choisie, tous les patients ayant rendez-vous : pathologie, état à l'arrivée (bilan), traitement en cours (séances). **Sortie : un PDF** envoyé par message au remplaçant. L'agenda sert à vérifier qu'aucun patient ne manque. Maquette sur la carte du projet.

## Étape 5 — dictée groupée (rappel)

- Une ou deux fois par jour (midi et/ou soir), tous les patients dictés d'un bloc. Rangement automatique quand le patient est le seul de ce nom parmi les rendez-vous du jour ; question seulement en cas de doute ; récapitulatif avec « Annuler ». Nom complet dicté réduit à l'initiale. IA la plus puissante, une seule demande pour toute la dictée.

## Autres idées notées (plus tard)

Résumé en tête de fiche (EVA, observance, exercices), suivi des exercices à domicile, clôture de prise en charge, schéma corporel des douleurs, lecture d'un dossier de bilans, couleurs et palettes d'affichage, transcription audio par un service dédié (il prévoit d'autres applis vocales).

## Pour reprendre

1. Lire `CLAUDE.md`, `PLAN.md` et ce fichier.
2. Attendre le « go » de Corentin, puis coder la sauvegarde (étape 4) selon la conception ci-dessus. Mettre `npm test` et `npm run test:e2e` au vert, monter la version (0.5.0), pousser sur la branche de travail, mettre à jour la carte du projet.
3. Lui redemander ses horaires et son accord sur la création de patient depuis l'agenda.
