# Plan — Appli de suivi patients, version autonome

Rédigé le 2 octobre 2026. À valider par Corentin avant tout code.
Vue illustrée : https://claude.ai/artifact/7vULqC1G8oPWJv1P8w5ZHb

## 1. Objectif de la V1

Reproduire à l'identique la version d'essai de claude.ai (`reference/bilans-seances-essai.html`) dans une appli autonome installée sur la tablette, avec deux nouveautés :

1. le résumé du bilan se fait tout seul au dépôt du PDF ou des photos ;
2. les données sont sauvegardées (automatiquement dans la tablette, et une copie chiffrée à sortir chaque semaine).

Ajoutée à la demande de Corentin : la **dictée groupée** (plusieurs patients en une dictée).

Hors V1 : téléphone, tout ce qui figure dans « Idées pour la suite » du CLAUDE.md.

## 2. Décisions validées

| # | Sujet | Décision |
|---|---|---|
| 1 | Appareils | Tablette Android seule (Brave, paysage) |
| 2 | Résumé des bilans | Automatique au dépôt |
| 3 | Données existantes | On repart de zéro |
| 4 | Ordre | D'abord à l'identique, puis les idées une par une |
| 5 | Installation | Appli web installable (« Ajouter à l'écran d'accueil »), code publié sur Railway, aucune donnée patient en ligne |
| 6 | IA | Compte API Anthropic à l'usage, avec plafond mensuel bas ; clé saisie dans les Paramètres |
| 7 | Sauvegarde | Fichier chiffré par mot de passe, rappel hebdomadaire ; copies automatiques internes à la tablette |

## 3. Architecture

- **Type d'appli** : application web installable (PWA), qui fonctionne hors connexion. Aucun serveur ne stocke de données patient.
- **Hébergement du code** : Railway (environ 5 € par mois), choisi par Corentin car un collègue le connaît. Il livre l'appli à la tablette et pourra plus tard faire tourner un petit serveur si besoin. Il ne stocke aucune donnée patient.
- **Données** : base locale du navigateur (IndexedDB), bilans PDF et photos compris. Demande de stockage persistant au navigateur pour éviter un effacement automatique.
- **IA** : appel direct depuis la tablette à l'API Anthropic. La clé est rangée dans la tablette. Usages : résumé des bilans (lecture du PDF ou des photos), mise au propre des séances, résumé « À venir », date du rendez-vous dicté. Modèle et coût précis choisis et mesurés à l'étape 3.
- **Sauvegarde** :
  - automatique : une copie interne de la base, tous les jours, dans la tablette (protège contre une fausse manœuvre, pas contre la perte de la tablette) ;
  - hebdomadaire : fichier chiffré (mot de passe choisi par Corentin) que l'appli propose d'enregistrer d'un geste ; Corentin le copie ensuite où il veut. Un navigateur Android ne permet pas d'écrire seul un fichier hors de l'appli : ce geste reste nécessaire.
  - restauration testée depuis ce fichier.
- **Outils** (pour Claude) : Vite + TypeScript, sans framework d'interface lourd ; pdf.js pour la visionneuse ; Web Crypto pour le chiffrement ; Vitest pour les règles métier ; Playwright pour vérifier les écrans en largeur tablette.

## 4. Modèle de données

Repris de la version d'essai (voir CLAUDE.md), avec trois ajustements :

- les fichiers des bilans sont stockés dans la base locale (plus de liens claude.ai) ;
- un dossier patient devient une entité à part (`dossiers`), qui porte les rendez-vous ; les bilans et les séances y sont rattachés. Fin des rendez-vous recopiés sur chaque bilan ;
- un journal `parametres` (clé IA, préférences d'affichage, date de dernière sauvegarde).

## 5. Écrans

| Écran | Contenu |
|---|---|
| Patients du jour | Liste classée Aujourd'hui / Demain / jours suivants / sans rendez-vous, recherche, badge « ? » homonymes |
| Fiche patient | Résumé coup d'œil, chiffres, rubriques, « à vérifier », « À venir », rendez-vous, visionneuse, séances |
| Dicter une séance | Date, zone de dictée (micro du clavier), aperçu « À venir », enregistrement puis mise au propre |
| Dictée groupée | Bouton micro sur la liste : plusieurs patients dictés à la suite, l'IA répartit par patient, Corentin vérifie puis enregistre |
| Paramètres | Clé IA, sauvegarde et restauration, affichage (taille du texte, thème, palettes de couleurs) |

### Dictée groupée (ajoutée le 2 octobre 2026)

- Bouton micro en haut de la liste des patients, qui ouvre une grande zone de dictée (micro du clavier).
- Corentin dicte toute sa matinée : « Avec Marc D., on a fait… Ensuite Lucie B.… ».
- L'IA découpe le texte par patient et le rattache aux dossiers existants, en s'aidant des rendez-vous du jour.
- Rangement automatique (décision de Corentin) : si le patient nommé correspond à un seul patient ayant rendez-vous ce jour-là, la séance va directement dans son dossier, sans validation.
- Validation seulement en cas de doute : deux patients possibles le même jour (homonymes), patient sans rendez-vous ce jour-là, ou patient non reconnu. Corentin choisit le dossier sur un écran court ; rien n'est deviné.
- Filet de sécurité sans geste en plus : un récapitulatif « 4 séances rangées : Marc D., Lucie B.… » s'affiche après l'enregistrement, avec un bouton « Annuler » pendant quelques secondes.
- Une fois validé, chaque morceau devient une séance normale (mise au propre, « À venir », rendez-vous dicté).
- Confidentialité : si un nom complet est dicté, il est réduit à l'initiale avant enregistrement.
- Limite connue : Brave ne propose pas de reconnaissance vocale intégrée aux pages ; on garde le micro du clavier, qui peut s'arrêter après un long silence (il suffit de le relancer).
- Piste plus tard, jugée probablement plus logique par Corentin : enregistrer l'audio et le faire transcrire par un service spécialisé. Un même abonnement pourrait servir à ses autres applis à commande vocale. Ajoute un service tiers qui reçoit la voix (confidentialité à examiner à ce moment-là).

### Couleurs (ajouté le 2 octobre 2026)

- L'appli est construite dès le départ avec des couleurs modifiables.
- Étape 4 : quelques palettes prêtes (dont une à contraste fort) en plus de la taille du texte et du thème clair / sombre.
- Plus tard : couleur du texte et couleur principale au choix (charte graphique personnelle).

## 6. Étapes

Chaque étape se termine par une version que Corentin ouvre sur la tablette. La version précédente reste disponible tant que la nouvelle n'est pas validée.

1. **Socle** : appli vide installable, en ligne, qui marche hors connexion. Validation : icône sur la tablette.
2. **Reproduction** : liste, fiche, séances, rendez-vous, homonymes, visionneuse, avec données locales. Règles métier couvertes par des tests automatiques (nom depuis le fichier, « À venir », âges compatibles, classement). Validation : ajouter un bilan de test, dicter une séance (sans IA).
3. **IA** : création du compte API (guidée), résumé automatique des bilans, mise au propre des séances, rendez-vous dicté. Garde-fous repris (35 %, calendrier fourni, rien d'inventé). Validation : 3 vrais bilans pseudonymisés, coût mesuré.
4. **Dictée groupée** : bouton micro, répartition par patient, écran de vérification. Validation : une vraie matinée dictée d'un bloc.
5. **Sauvegarde et paramètres** : copies automatiques, fichier chiffré hebdomadaire, restauration testée sur une tablette vierge, réglages d'affichage et palettes de couleurs.
6. **Usage réel** : quelques jours au cabinet, liste des retours, corrections.
7. **Idées, une par une** : EVA et observance, exercices à domicile, clôture, schéma corporel, lecture d'un dossier de bilans, propositions de séance.

## 7. Risques et parades

| Risque | Parade |
|---|---|
| Brave efface les données du site (boucliers, nettoyage à la fermeture) | Stockage persistant demandé, réglage Brave vérifié à l'installation, sauvegarde hebdo |
| Tablette perdue ou cassée | Fichier de sauvegarde chiffré copié hors de la tablette |
| Clé IA visible si quelqu'un accède à la tablette déverrouillée | Plafond de dépenses bas, clé révocable en un clic |
| Erreur de l'IA dans un résumé | Points « à vérifier », texte d'origine toujours consultable |
| Données de santé envoyées à l'IA | Pseudonymisation (règles du CLAUDE.md) ; avis CNIL / Ordre recommandé |

## 8. Questions encore ouvertes

- Modèle d'IA et coût réel : mesurés à l'étape 3.
