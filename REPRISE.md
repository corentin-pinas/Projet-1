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
| 4 | Sauvegarde : copies internes (0.5.0, en production) + copie hors de Chrome (0.5.1) | Faite, à valider sur la tablette |
| 5 | Dictée groupée | Faite (0.6.0), à valider sur une vraie matinée |
| 6 | Agenda | À faire (maquette validée, deux questions ouvertes) |
| 7 | Transmissions en PDF | À faire |
| 8 | Ses autres idées, une par une | Plus tard |

## Étape 4 — sauvegarde (version 0.5.0, 11 octobre 2026)

- **Décision du 11 octobre** : sauvegarde **interne à la tablette seulement**. Pas de fichier sur Drive pour l'instant, donc **pas de mot de passe** (chiffrer une copie rangée à côté des données ne protège rien). Corentin accepte le risque de tout perdre si la tablette est perdue ou cassée : la future version PC aura sa propre sauvegarde à deux endroits.
- **Copie automatique chaque jour** (store `copies`, base en version 3), faite avant le premier changement de la journée ou à l'ouverture : elle garde l'état de la veille au soir. Texte seulement (dossiers, bilans, séances ; pas les réglages). **7 copies gardées**, la plus ancienne effacée.
- Les PDF et photos ne sont pas recopiés : un fichier reste gardé tant qu'un bilan ou une copie y renvoie (`nettoyerFichiers` dans `src/db.ts`). Un bilan supprimé par erreur revient donc avec son PDF.
- **Retour en arrière** dans « État de l'appli », partie « Copies de sécurité » (`src/copies.ts`) : « Revenir à cette copie ». L'état actuel est d'abord gardé (`avant-retour`), ce qui permet « Annuler le retour en arrière ».
- Non testé sur la vraie tablette. Limite assumée : effacer les données de Chrome ou désinstaller l'appli efface aussi les copies.
- **Copie hors de Chrome (version 0.5.1, 25 octobre 2026, demandée par Corentin)** : bouton « Copier hors de Chrome » qui télécharge un fichier complet (texte + PDF et photos) dans « Téléchargements », `mes-patients-AAAA-MM-JJ.sauvegarde`. Chiffré (AES-GCM 256, clé PBKDF2 SHA-256 600 000 tours, morceau par morceau : `src/fichier-copie.ts`) avec un mot de passe choisi une fois et **retenu par la tablette** (option 1 choisie par Corentin), à noter sur papier. Survit à un effacement des données de Chrome, pas à la perte de la tablette. Pas de Drive. Rappel : la ligne « Copie hors de Chrome » de « État de l'appli » passe en orange après 7 jours. « Restaurer depuis un fichier » : essaie le mot de passe retenu, sinon le demande ; l'état actuel est gardé (annulable).
- Non testé sur la vraie tablette : le téléchargement depuis l'appli installée et le choix du fichier à restaurer dans le sélecteur Android.

## Étape 6 — agenda (maquette validée)

- Vue semaine en colonnes. **Séance = 20 minutes ; bilan = 40 minutes** (deux créneaux). Au moment d'ajouter un rendez-vous : « Séance » ou « Bilan ».
- **Toucher un patient ouvre sa fiche** ; toucher un trou permet d'y placer un patient.
- Trous anormaux en orange, d'après ses horaires habituels.
- Le modèle de rendez-vous doit gagner une durée ou un type (aujourd'hui `{d, h}`, un par jour et par patient au plus).
- **Questions en attente** : (1) ses horaires jour par jour avec la pause de midi ; (2) accord pour **créer un patient depuis l'agenda** (prénom + initiale, « bilan à venir »), le PDF déposé ensuite rejoignant son dossier.

## Étape 7 — transmissions

- Pour une période choisie, tous les patients ayant rendez-vous : pathologie, état à l'arrivée (bilan), traitement en cours (séances). **Sortie : un PDF** envoyé par message au remplaçant. L'agenda sert à vérifier qu'aucun patient ne manque. Maquette sur la carte du projet.

## Étape 5 — dictée groupée (version 0.6.0, 26 octobre 2026)

- Bouton « 🎙️ Dictée groupée » sous « Ajouter des bilans » : grande zone de texte (micro du clavier), date « Aujourd'hui / Hier / autre » (Corentin dicte parfois le lendemain matin). Brouillon gardé dans la tablette à chaque mot (`dictee_brouillon`).
- **Une seule demande à l'IA la plus puissante** (`decouperDictee` dans `src/ia.ts`) : découpe par patient, extrait mot pour mot, mise au propre, « À venir », rendez-vous dicté. La liste des patients de l'appli (prénom + initiale, « rendez-vous ce jour-là ») est fournie pour corriger les prénoms mal reconnus. Garde-fou : si les extraits font moins de 60 % de la dictée, rien n'est rangé.
- **Rattachement fait par l'appli, pas par l'IA** (`rattacher` dans `src/regles.ts`, règle souple choisie par Corentin) : un seul dossier possible parmi les rendez-vous du jour, sinon un seul dossier à ce nom dans toute l'appli → rangé seul. Sinon question : candidats par heure de rendez-vous, ou tous les dossiers si le nom est inconnu ; « Ne pas ranger ce passage » possible. Passages en attente gardés (`dictee_doutes`).
- Corentin dicte prénom seul ou prénom + initiale, jamais le nom de famille (identitovigilance) ; un nom complet est de toute façon réduit à l'initiale.
- Récapitulatif « N séances rangées » avec « Annuler cette dictée » : séances retirées, rendez-vous remis, texte dicté rendu pour correction.
- Non testé en vrai : qualité du découpage sur une vraie matinée, durée de la demande (limite de 5 minutes du serveur).

## Autres idées notées (plus tard)

Résumé en tête de fiche (EVA, observance, exercices), suivi des exercices à domicile, clôture de prise en charge, schéma corporel des douleurs, lecture d'un dossier de bilans, couleurs et palettes d'affichage, transcription audio par un service dédié (il prévoit d'autres applis vocales).

## Pour reprendre

1. Lire `CLAUDE.md`, `PLAN.md` et ce fichier.
2. Sauvegarde interne faite (0.5.0) , en production depuis le 25 octobre 2026. Copie hors de Chrome (0.5.1) et correction de la liste qui se chevauchait (0.5.2) en production le 25 octobre. À valider sur la tablette. Ensuite : dictée groupée, puis un écran Réglages (couleurs, taille du texte). Prochaine étape : dictée groupée.
3. Lui redemander ses horaires et son accord sur la création de patient depuis l'agenda.
