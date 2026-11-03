# Audit de Muninn — version 1.2.1, 3 novembre 2026

- **Périmètre** : tout le code (`src/`, `serveur/`, `server.mjs`, `public/pc/` : `muninn-pc.mjs`, `voix.py`, `installer.ps1`, `tests/`, `vite.config.ts`, `playwright.config.ts`, `railway.json`, `package.json`). Notes lues : `CLAUDE.md` et `REPRISE.md` de la branche `ccr-5fa8a3ae-zcpk2o` (code identique à la production).
- **Lecture seule** : aucun fichier du code n'a été modifié ; ce rapport est le seul fichier ajouté.
- **État de départ** : `npm test` → **120/120** ; `npm run test:e2e` (vérification des types + construction + tests d'écran) → **53/53**.
- **Méthode** : lecture complète, puis chaque doute a été rejoué quand c'était possible, **avec le vrai code** : scripts Vitest (une base IndexedDB par « appareil » simulé, et le vrai Muninn du PC lancé à part), tests d'écran Playwright (même configuration que ceux du dépôt), vrai Claude Code 2.1.292 face à un faux point d'accès qui enregistre ce qu'il reçoit, serveurs interrogés avec des en-têtes forgés, mesures de temps sur le volume d'une année. Les scripts sont en **annexe B** (gardés ici car le brouillon de la session disparaît).
- **Statuts** : *confirmé (reproduit)* = rejoué par un script ou un test ; *confirmé (tracé)* = chemin suivi ligne à ligne dans le code ; *plausible* = dépend d'un comportement extérieur (réseau, Railway, Android, durée réelle de l'IA) impossible à vérifier ici.
- **Gravité** : *Critique* = perte silencieuse de données sur tous les appareils dans un scénario réaliste ; *Élevée* = perte ou divergence de données, ou panne durable du partage, dans un scénario plausible ; *Moyenne* = perte d'un travail en cours (voix, dictée, saisie), donnée attendue absente, faille exploitable sous conditions ; *Faible* = cas rares, effets limités, hygiène ; *Info* = choix assumé, à connaître.

---

## 1. Pour Corentin

1. Muninn tient la route : tous les tests passent, et au quotidien vos bilans et séances enregistrés ne disparaissent pas d'eux-mêmes. Les pertes possibles touchent un travail en cours (voix, dictée, saisie) ou les remises en route après une panne.
2. Le point le plus sérieux : si vous restaurez votre fichier de copie sur une tablette neuve puis la reliez au PC, ou si vous « déliez » puis « reliez » un appareil, ses anciennes versions écrasent les nouvelles sur tous vos appareils.
3. En attendant la correction : tablette perdue ou effacée → installez Muninn et reliez-la au PC, sans restaurer le fichier (il ne sert que si le PC est perdu aussi). N'utilisez pas « Délier ».
4. Si Muninn ne répond plus sur le PC (après une coupure de courant par exemple), ne remettez pas de copie vous-même : demandez à Claude. Sinon les appareils affichent « À jour » alors que plus rien ne passe.
5. Dictée groupée : l'IA peut oublier un patient entier sans le signaler, et le texte dicté n'est pas gardé. Vérifiez d'un coup d'œil la ligne « X séances rangées : … ».
6. Pendant un enregistrement de voix, ne touchez ni « Ma journée » ni un autre patient (l'enregistrement part à la poubelle sans question), et gardez l'écran allumé : s'il s'éteint, le micro se coupe.
7. Une séance restée en texte brut avec le bouton « Mettre au propre » ne sera pas reprise toute seule, et son rendez-vous dicté n'est pas posé : touchez le bouton.
8. « Annuler cette dictée » peut effacer un rendez-vous posé entre-temps pour un autre patient ; une correction « à vérifier » en cours de frappe s'efface si vous passez par une autre appli.
9. Deux réglages à vérifier : un code d'accès Railway long et tiré au hasard, et le chiffrement du disque du PC (« Chiffrement de l'appareil » dans les paramètres de Windows).
10. Suite proposée : une vingtaine de petites corrections invisibles, une à la fois, chacune avec son test et votre « mets en production », avant le suivi de l'évolution.

---

## 2. Tableau des constats (du plus grave au moins grave)

| N° | Gravité | Axe | Constat | Où | Statut | Correction : taille / risque |
|---|---|---|---|---|---|---|
| C1 | **Critique** | Données | Restaurer une copie puis relier au PC, ou délier puis relier : l'appareil renvoie partout ses vieilles versions (corrections perdues, patients supprimés qui reviennent) | `src/fusion.ts:42, 47-53`, `src/synchro.ts:64-67, 79`, `src/db.ts:276-278` | confirmé (reproduit) | moyenne / moyen |
| E1 | **Élevée** | Données | PC remis à une copie plus ancienne : refus en silence, « À jour avec le PC » affiché, appareils qui divergent | `src/synchro.ts:103-110, 134`, `public/pc/muninn-pc.mjs:145` | confirmé (reproduit) | moyenne / moyen |
| E2 | **Élevée** | Données | Muninn du PC ne redémarre plus si `donnees.json` est abîmé (pas de repli sur `copies/`, écriture sans `fsync`) ; partage et voix arrêtés | `public/pc/muninn-pc.mjs:39-46` | confirmé (reproduit) | petite / faible |
| E3 | **Élevée** | IA / données | Dictée groupée : l'IA peut oublier un patient entier (jusqu'à 40 % du texte) sans erreur, et la dictée d'origine est effacée après rangement | `src/ia.ts:387`, `src/dictee.ts:246`, `src/moteur.ts:282` | confirmé (reproduit) | petite + moyenne / faible à moyen |
| M1 | Moyenne | Fiabilité | Enregistrement de voix jeté sans question en touchant « Ma journée », un autre patient… ; enregistrement « gardé » après un échec seulement en mémoire | `src/app.ts:151, 360`, `src/voix-seance.ts:11, 30-34`, `src/dictee.ts:29` | confirmé (reproduit) | petite / faible |
| M2 | Moyenne | Fiabilité | Rien ne garde l'écran allumé pendant l'enregistrement : la mise en veille coupe le micro (cause du bug 1.2.1) | `src/transcription.ts:46-73` | confirmé (tracé + vu en vrai) | petite / faible |
| M3 | Moyenne | Fiabilité / IA | Mise au propre d'une séance jamais reprise après un échec ou hors connexion : rendez-vous dicté jamais posé | `src/moteur.ts:229-252` | confirmé (reproduit) | moyenne / faible |
| M4 | Moyenne | Données | « Annuler cette dictée » remet les rendez-vous de tous les patients, et efface ceux posés depuis | `src/dictee.ts:242, 269-272` | confirmé (reproduit) | petite / faible |
| M5 | Moyenne | Données | Deux retours en arrière de suite : l'état d'avant le premier retour est perdu | `src/db.ts:247` | confirmé (reproduit) | petite / faible |
| M6 | Moyenne | Sécurité | Limite des 5 essais du code d'accès contournable par l'en-tête `X-Forwarded-For` | `server.mjs:63` (et `muninn-pc.mjs:89`) | confirmé en local ; Railway à vérifier | petite / faible |
| M7 | Moyenne | Fiabilité | Correction « à vérifier » en cours de frappe effacée par un redessin (retour sur l'appli, fin d'un travail de l'IA, échange avec le PC) | `src/app.ts:25, 62-80, 234-244` | confirmé (reproduit) | petite / faible |
| M8 | Moyenne | Fiabilité | Aucun délai d'attente côté appli (IA, transcription) ; le serveur continue quand l'appli a lâché | `src/ia.ts:70-74`, `src/transcription.ts:80, 91`, `server.mjs:111-116` | plausible (absence tracée) | petite / faible |
| M9 | Moyenne | Fiabilité / IA | Dictée d'une journée entière : réponse de l'IA proche ou au-delà de la limite de 5 minutes du serveur | `serveur/claude.mjs:190`, `src/ia.ts:391-396` | plausible (estimation) | moyenne / moyen |
| M10 | Moyenne | Fiabilité | Chaque ouverture du bilan complet et chaque résumé laissent un lecteur PDF actif en mémoire | `src/app.ts:521`, `src/moteur.ts:65` | confirmé (reproduit) | petite / faible |
| F1 | Faible | Données | Patient supprimé (ou fusionné) sur un appareil pendant qu'un autre lui ajoute une séance : séance orpheline, invisible partout | `src/db.ts:106-171`, `src/fusion.ts:44-45` | confirmé (reproduit) | moyenne / moyen |
| F2 | Faible | Données | Changement fait pendant la réception d'un échange : écrasé (fenêtre courte) | `src/synchro.ts:123-132` | confirmé (fenêtre forcée) | moyenne / moyen |
| F3 | Faible | Données | Rendez-vous passés effacés à chaque rendez-vous posé ou modifié (agenda passé incomplet, pas d'historique pour les absences) | `src/regles.ts:213-217` via `src/app.ts:302`, `src/moteur.ts:223` | confirmé (reproduit) | petite / faible |
| F4 | Faible | Fiabilité | Montée de version de la base sans garde : une 2e fenêtre ouverte bloquerait le démarrage | `src/db.ts:29-41` | plausible | petite / faible |
| F5 | Faible | IA | Bilan déposé sur un appareil sans IA réglée (Chrome du PC ?) : jamais résumé automatiquement ailleurs | `src/moteur.ts:147` | plausible | petite / faible |
| F6 | Faible | IA | Dictée > 60 000 caractères et séance > 8 000 caractères tronquées sans le dire | `src/ia.ts:296, 321, 370, 387` | confirmé (reproduit) | petite / faible |
| F7 | Faible | IA | « 60 dernières » corrections et lectures confirmées prises au hasard ; patients donnés à la dictée coupés à 400 au hasard | `src/moteur.ts:115-116, 267`, `src/ia.ts:140, 356` | confirmé (reproduit / tracé) | petite / faible |
| F8 | Faible (aujourd'hui) | Performances | Dans un an : comparaison complète de la base à chaque échange, relecture des 7 copies, base relue à chaque changement, texte de séance stocké 3 fois, copie hors de Chrome tenue entièrement en mémoire | voir § 6.4 | mesuré / estimé | grosse en petites étapes / moyen |
| F9 | Faible | Sécurité | Hygiène : services du PC en SYSTEM, dépendances Python non figées, son temporaire hors du dossier protégé, trafic non essentiel de Claude Code, pas de CSP, données supprimées gardées sur le PC, chiffrement du disque à vérifier | voir détail | confirmé (tracé) | petite à moyenne / faible |
| F10 | Faible | Fiabilité | Deux fenêtres de Muninn sur le même appareil : bilan résumé deux fois, deux échanges en même temps | `src/moteur.ts:7-8`, `src/synchro.ts:85-96` | plausible | petite / faible |
| F11 | Info | IA | Rangement « au prénom seul » (choix de Corentin) : un nouveau patient au même prénom qu'un patient existant serait rangé chez lui | `src/regles.ts:283-295` | tracé (choix assumé) | — |
| A1 | Entretien | Architecture | `app.ts` : état en drapeaux + redessin complet de la fiche (cause de M7) | `src/app.ts` | tracé | petite puis moyenne / faible |
| A2 | Entretien | Architecture | Enregistreur de voix écrit deux fois, avec deux comportements différents (cause de M1) | `src/dictee.ts:127-177`, `src/voix-seance.ts` | tracé | moyenne / faible |
| A3 | Entretien | Architecture | Écritures « liste complète » calculées sur une lecture ancienne, lectures puis écritures en deux temps | `src/db.ts:118-200`, `src/agenda.ts:130`, `src/app.ts:302` | tracé | petite / faible |
| A4 | Entretien | Architecture | Petits doublons (dates, durées, pluriels), code mort, documentation en retard | voir § 6.1 | tracé | petite / nul |
| A5 | Entretien | Architecture / perf | Texte de chaque séance recopié dans `propre_source` et `bref_source` | `src/moteur.ts:215-216` | tracé | moyenne / moyen |

Total : 1 critique, 3 élevés, 10 moyens, 10 faibles, 1 info, 5 points d'entretien. 16 constats ont été rejoués par un script ou un test d'écran, et F8 a été mesuré.

---

## 3. Détail des constats

### C1 — Restaurer puis relier, ou délier puis relier : les vieilles versions gagnent partout

- **Où** : `src/fusion.ts:47-53` — sans version commune (`base` nulle, `b = {}`), un champ différent des deux côtés prend la valeur de l'appareil (`lk`), et `src/fusion.ts:42` garde chez l'appareil un élément supprimé sur le PC ; `src/synchro.ts:64-67` (relier à une adresse « nouvelle » efface les versions communes et repart du numéro 0) et `src/synchro.ts:79` (délier fait de même) ; `src/db.ts:276-278` (`importer` remplace la base sans rien dire au partage).
- **Scénario (reproduit)** : lundi, « Copier hors de Chrome ». Mardi, une séance est corrigée et un patient supprimé ; le PC les a reçus. Mercredi la tablette casse ; sur la neuve, « Restaurer depuis le fichier » puis « Relier au PC ». Résultat : la séance redevient celle de lundi et le patient supprimé revient, sur la tablette neuve, le PC et l'iPhone. Même chose quand un appareil est délié puis relié plus tard (testé : le téléphone relié de nouveau remet sa « version 1 » sur la tablette), ou quand l'adresse du PC est retapée autrement (`coco` au lieu de `coco.tailadd5a8.ts.net`) : l'appli croit à un nouveau PC.
- **À savoir aussi** : sur un appareil déjà relié, « Revenir à une copie » et « Restaurer depuis le fichier » reviennent en arrière **sur tous les appareils**. C'est voulu pour la copie du jour, mais une copie de plusieurs semaines efface partout tout ce qui a été fait depuis ; les textes de confirmation ne le disent pas (celui de la restauration parle de « remplacer les données de cette tablette »).
- **Conséquence** : perte silencieuse du travail récent sur tous les appareils, au moment même où Corentin cherche à réparer.
- **Correction** : quand un appareil se relie sans version commune, le PC fait foi pour tout ce qu'il connaît (valeurs et suppressions) ; l'appareil n'envoie que ce que le PC n'a jamais vu. Concrètement, dans `recevoir`, si aucune base n'existe pour la clé, prendre la valeur du PC au lieu de `fusion3(null, ici, distant)`. La première liaison d'une tablette pleine vers un PC vide ne change pas (rien à recevoir, tout part). Préciser le texte de confirmation des retours en arrière sur un appareil relié (petit changement visible, à valider).
- **Taille / risque** : moyenne (quelques lignes de `synchro.ts`/`fusion.ts`) / moyen (cœur du partage) : seulement derrière les tests de l'annexe B.
- **Tests à écrire avant** : « tablette neuve : restaurer puis relier » et « délier puis relier » (annexe B, `partage.test.ts`) doivent garder la correction et la suppression ; « première liaison d'une tablette pleine vers un PC vide » doit toujours tout envoyer ; « appareil vide relié à un PC plein » doit tout recevoir.

### E1 — PC remis à une copie plus ancienne : « À jour » affiché, plus rien ne passe

- **Où** : `src/synchro.ts:134` (le numéro rendu par le PC est pris même s'il recule) ; `src/synchro.ts:103-110` (après 3 refus, l'échange est quand même déclaré réussi, `erreur: null`) ; `public/pc/muninn-pc.mjs:145` (refus quand le numéro ne correspond pas) ; la base du PC n'a aucune identité.
- **Scénario (reproduit)** : `donnees.json` est remplacé par une copie de `copies/` (réparation après E2, Windows réinstallé, sauvegarde du PC restaurée). Les appareils, qui ont des numéros plus récents, voient leurs modifications refusées une à une ; la tablette affiche « À jour avec le PC » ; une séance ajoutée la veille n'arrive jamais sur le PC ; un appareil neuf relié reçoit les anciennes versions.
- **Conséquence** : appareils qui divergent sans aucun signal ; le PC, qui sert de sauvegarde de référence, est en retard ; une remise en route ultérieure (C1) peut ensuite propager ces vieilles versions.
- **Correction** : donner une identité à la base du PC (tirée au hasard, changée dès que le PC repart d'une copie), renvoyée par `/api/sync/etat` et `/api/sync/changements` ; côté appareil, si l'identité change ou si le numéro recule, ne plus dire « À jour » : erreur explicite et remise à niveau guidée depuis l'appareil le plus à jour (la tablette) ; ne jamais déclarer réussi un échange qui garde des refus.
- **Taille / risque** : moyenne / moyen. Message visible seulement en cas de panne.
- **Tests à écrire avant** : `partage.test.ts` « PC remis à une copie plus ancienne » (l'appareil doit signaler l'erreur) ; « trois refus de suite → pas “À jour” ».

### E2 — Muninn du PC qui ne redémarre plus si `donnees.json` est abîmé

- **Où** : `public/pc/muninn-pc.mjs:39-40` (`JSON.parse` sans secours) ; `:43-46` (écriture du `.tmp` puis renommage, sans `fsync`) ; la tâche planifiée peut relancer le programme (`public/pc/installer.ps1:46`), mais il s'arrêtera à chaque fois.
- **Scénario (reproduit)** : fichier tronqué, fichier vide, ou `donnees.json` absent avec un `.tmp` abîmé → arrêt immédiat (`SyntaxError`, code 1) à chaque démarrage. Cause réaliste : coupure ou plantage de Windows pendant une écriture (le fichier entier est réécrit à chaque modification reçue).
- **Conséquence** : plus de partage ni de dictée à la voix (Whisper passe par Muninn du PC) ; chaque appareil continue seul et ne perd rien, mais la réparation à la main (remettre une copie de `copies/`) mène tout droit à E1.
- **Correction** : écrire sûrement (`fsync` du `.tmp` avant le renommage) ; au démarrage, si `donnees.json` est illisible : le mettre de côté (`donnees.json.abime-…`), essayer le `.tmp`, sinon la dernière copie lisible de `copies/`, en changeant l'identité de la base (E1) et en le notant dans un journal. Jamais de démarrage silencieux sur une base vide quand des copies existent.
- **Taille / risque** : petite / faible (fichier autonome, testable ici ; à revérifier ensuite sur le PC).
- **Tests à écrire avant** : démarrage sur fichier tronqué, vide, ou `.tmp` abîmé → démarre sur la bonne copie, garde le fichier abîmé, journal écrit.

### E3 — Dictée groupée : un patient peut être oublié, et la dictée d'origine disparaît

- **Où** : `src/ia.ts:387` (les extraits doivent seulement couvrir 60 % du texte) ; `src/dictee.ts:246` (brouillon vidé après rangement) ; `src/moteur.ts:282` (la séance ne garde que l'extrait de l'IA). La dictée complète n'est gardée qu'en mémoire pour « Annuler » (`dernier.texte`).
- **Scénario (reproduit)** : dictée de 5 patients ; l'IA renvoie 4 passages (Sylvie oubliée, 20 % du texte) : 4 séances rangées, aucune erreur. Après « Nouvelle dictée » ou à la fermeture de l'appli, le texte dicté n'existe plus nulle part ; le « Texte d'origine » de chaque séance est l'extrait découpé par l'IA.
- **Conséquence** : une séance entière perdue sans signal (le récapitulatif liste 4 noms sans dire qu'il en manque un). Avec le choix « pas de relecture », c'est le principal risque de l'IA au quotidien.
- **Correction** (sans revenir sur « pas de relecture ») : 1) garder chaque dictée d'origine (texte complet et date) dans la base, par exemple les 30 dernières ; 2) contrôle plus fin : chaque patient annoncé (« avec X », « ensuite Y »…) doit avoir son passage, et la couverture des mots hors annonces doit dépasser ~85-90 % ; sinon la dictée reste dans la zone de texte avec le message actuel « L'IA a laissé de côté une partie de la dictée ».
- **Taille / risque** : petite (garder) + moyenne (contrôle) / faible et moyen (un contrôle trop strict refuserait des dictées correctes : le régler sur de vraies dictées).
- **Tests à écrire avant** : `dictee-garde.test.ts` (annexe B) doit être refusé ; une dictée normale, avec ses annonces, doit passer ; la dictée d'origine doit être retrouvable après rangement.

### M1 — Enregistrement de voix jeté sans question, ou « gardé » seulement en mémoire

- **Où** : `src/app.ts:151` et `:360` (un redessin sans formulaire appelle `voixSeance.quitter()`) ; gestes qui ferment le formulaire : `:126` (patient de la liste), `:135` (dictée groupée), `:221` (autre bilan), `:313` (« Ajouter un rendez-vous »), `:402` (« Modifier » une autre séance), `:475` (« ← Ma journée »), patient touché dans l'agenda ; `src/voix-seance.ts:30-34` (`quitter` annule l'enregistrement et oublie `attente`) ; `src/voix-seance.ts:11` et `src/dictee.ts:29` (enregistrement non transcrit en mémoire seulement).
- **Scénario (reproduit pour « Ma journée »)** : « Enregistrer ma séance », il parle, touche par erreur « ← Ma journée » : aucune question, l'enregistrement est jeté, aucune séance. Seul « Annuler » du formulaire demande confirmation. Autre cas (tracé) : transcription en échec (PC éteint) → « Il est gardé » ; il disparaît pourtant si le formulaire se ferme, si l'appli est fermée ou mise à jour, ou si Android la ferme en arrière-plan (idem pour la dictée groupée).
- **Conséquence** : dictée à refaire de mémoire.
- **Correction** : ranger tout enregistrement non transcrit dans la base (IndexedDB garde les sons) jusqu'à sa transcription, et le reproposer à la réouverture ; avant de couper un enregistrement en cours, poser la même question que « Annuler » (petit changement visible, à valider).
- **Taille / risque** : petite / faible.
- **Tests à écrire avant** : AUDIT 2 inversé (question posée, rien de perdu) ; échec de transcription → rechargement → enregistrement toujours proposé.

### M2 — Écran qui s'éteint = micro coupé

- **Où** : `src/transcription.ts:46-73` (rien ne demande de garder l'écran allumé ; aucun `wakeLock` dans le code).
- **Scénario** : dictée de 2-3 minutes, tablette posée ; la mise en veille de l'écran coupe le micro. Depuis 1.2.1 le début est gardé, mais tout ce qui est dit après la coupure est perdu sans qu'il s'en aperçoive (constaté par Corentin le 2 novembre : c'est la cause du bug corrigé en 1.2.1).
- **Correction** : demander à l'appareil de garder l'écran allumé pendant l'enregistrement (API « Wake Lock » : Chrome Android ; Safari récent sur l'iPhone, à vérifier en mode appli installée), relâché à l'arrêt ou à l'annulation ; la redemander au retour sur l'appli.
- **Taille / risque** : petite / faible ; rien ne change à l'écran (il reste juste allumé pendant l'enregistrement).
- **Test** : test d'écran avec un espion sur `navigator.wakeLock.request` (demandé au début, relâché à la fin, y compris sur « Annuler »).

### M3 — Mise au propre d'une séance jamais reprise

- **Où** : `src/moteur.ts:229-252` (une seule tentative, juste après l'enregistrement) ; `:235` (hors connexion : abandon silencieux) ; pas d'équivalent de `resumerEnAttente` (`:138-153`, qui existe pour les bilans).
- **Scénario (reproduit)** : séance enregistrée, réseau coupé pendant l'analyse (tablette en veille, Wi-Fi perdu, iPhone verrouillé, Railway qui redémarre lors d'une mise en production) ; à la réouverture, rien ne repart. Même chose pour une séance enregistrée hors connexion.
- **Conséquence** : texte brut, pas de résumé dans « Ma journée », et le rendez-vous dicté (« dans une semaine, le matin ») n'est jamais posé : le patient manque dans « Ma journée » du jour prévu. Seul le bouton « Mettre au propre » de la séance rattrape.
- **Correction** : file d'attente des séances sans analyse (`ia_ok` absent), relancée à l'ouverture et au retour du réseau, une tentative par ouverture, par l'appareil où la séance a été notée (ajouter `origine` aux séances, comme aux bilans, pour ne pas payer deux fois). Garder la règle actuelle : le rendez-vous n'est posé que s'il est à venir et que la séance est la plus récente.
- **Taille / risque** : moyenne / faible (quota : une tentative par ouverture).
- **Tests à écrire avant** : AUDIT 5 inversé ; une séance venue d'un autre appareil n'est pas analysée ici ; hors ligne puis en ligne → analysée.

### M4 — « Annuler cette dictée » remet les rendez-vous de tout le monde

- **Où** : `src/dictee.ts:242` (photo des rendez-vous de **tous** les dossiers avant la dictée) ; `src/dictee.ts:269-272` (remise de tout dossier dont les rendez-vous ont changé depuis).
- **Scénario (reproduit)** : dictée rangée (Marc) ; il pose ensuite un rendez-vous à Lucie (ou l'iPhone en pose un, reçu par le partage) ; il annule la dictée → le rendez-vous de Lucie disparaît.
- **Correction** : ne remettre que les dossiers touchés par la dictée, et seulement si leurs rendez-vous sont encore ceux laissés par la dictée.
- **Taille / risque** : petite / faible. **Test** : AUDIT 4 inversé.

### M5 — Deux retours en arrière de suite effacent l'état d'origine

- **Où** : `src/db.ts:247` (la copie « avant le dernier retour » est remplacée à chaque retour ou restauration).
- **Scénario (reproduit)** : « Revenir à la copie de dimanche » (fausse manœuvre), puis « Revenir à la copie de lundi » pour essayer, puis « Annuler le retour en arrière » : on retombe sur dimanche, le travail du jour est perdu (et, sur un appareil relié, la perte part vers les autres appareils). Même chose avec deux restaurations de fichier.
- **Correction** : ne pas remplacer la copie « avant le retour » si rien n'a été modifié depuis le retour précédent.
- **Taille / risque** : petite / faible. **Test** : `divers.test.ts` (annexe B) inversé.

### M6 — Limite des 5 essais du code d'accès contournable

- **Où** : `server.mjs:63` (l'adresse est le premier élément de `X-Forwarded-For`, que l'appelant peut écrire lui-même) ; même code dans `public/pc/muninn-pc.mjs:89` (sans enjeu réel : le PC n'est joignable que par Tailscale).
- **Scénario (reproduit en local)** : même adresse → `401` cinq fois puis `429` ; adresse changée à chaque essai dans l'en-tête → 20 × `401`, jamais bloqué. Sur Railway, l'effet dépend de la façon dont son proxy remplit cet en-tête : s'il ajoute l'adresse réelle en fin de liste, la limite ne protège plus.
- **Conséquence** : essais illimités contre `CODE_ACCES` depuis internet ; si le code est devinable, quelqu'un peut consommer l'abonnement Pro, déconnecter Claude Code ou le connecter à un autre compte. Aucune donnée patient n'est stockée sur Railway.
- **Correction** : prendre l'adresse posée par Railway (`X-Real-IP`, ou le dernier élément de la liste), ajouter un plafond global d'échecs (par exemple 30 par 10 minutes, toutes adresses confondues), et un code long tiré au hasard.
- **Taille / risque** : petite / faible. **Test** : en-tête changeant à chaque essai → `429` au plus tard au plafond global.

### M7 — Correction « à vérifier » effacée pendant la frappe

- **Où** : `src/app.ts:25` (`busy()` ne connaît pas ce champ) ; `:234-244` (champ « Corriger » ajouté sans repère) ; `:62-67`, `:69`, `:76-80` (redessin complet de la fiche sur tout changement de la base, toute fin de travail de l'IA, tout retour sur l'appli).
- **Scénario (reproduit, deux façons)** : il touche « Corriger », dicte la correction au micro du clavier, passe dans une autre appli (Maiia, un message) et revient → champ effacé. Ou : il vient de corriger le point 1, commence le point 2, et l'IA finit de reporter le point 1 → champ effacé. Même effet si un échange avec le PC apporte un changement.
- **Correction** : un repère unique « saisie en cours » : ne pas redessiner la fiche tant qu'un champ de la fiche a le focus ou contient du texte non enregistré (couvre aussi les champs à venir).
- **Taille / risque** : petite / faible. **Tests** : AUDIT 1a et 1b inversés ; le formulaire de séance reste protégé comme aujourd'hui.

### M8 — Pas de délai d'attente côté appli ; le serveur continue quand l'appli a lâché

- **Où** : `src/ia.ts:70-74` (`fetch` vers `/api/ia/travail` sans délai) ; `src/transcription.ts:80` et `:91` (transcription sans délai) ; `server.mjs:111-116` (aucune écoute de la coupure de la connexion).
- **Scénario** : réseau qui se perd sans erreur (bascule Wi-Fi/4G, PC mis en veille pendant une transcription) : « L'IA range votre dictée… » ou « Transcription de votre voix sur le PC… » reste affiché indéfiniment ; la séance ne peut pas être enregistrée tant que la transcription « tourne ». Côté serveur, Claude Code continue jusqu'à 5 minutes pour rien (quota), et la file unique retarde les demandes suivantes.
- **Correction** : délais côté appli (IA ~12 minutes, file d'attente du serveur comprise ; voix ~15 minutes), texte et enregistrement gardés ; côté serveur, arrêter Claude Code si l'appli ferme la connexion.
- **Taille / risque** : petite / faible. **Statut** : plausible (absence de délai tracée). **Tests** : route jamais servie → message après le délai, dictée gardée ; client qui coupe → faux Claude Code arrêté.

### M9 — Grosse dictée groupée et limite de 5 minutes

- **Où** : `serveur/claude.mjs:190` (5 minutes) ; `src/ia.ts:391-396` (une seule demande pour toute la dictée ; la réponse recopie chaque extrait mot pour mot puis le met au propre : environ deux fois le texte dicté en sortie). En mode abonnement, Claude Code autorise 128 000 jetons de sortie (vérifié) : la limite est donc la durée, pas la longueur.
- **Scénario** : dictée du soir pour toute la journée (16 à 22 patients, 15 000 à 20 000 caractères) → l'IA la plus puissante doit écrire l'équivalent de 30 000 à 40 000 caractères : de l'ordre de 3 à 6 minutes. Au-delà de 5 : échec, puis échec à nouveau au « Réessayez ».
- **Correction** : d'abord mesurer (journal du serveur : durée et taille, sans contenu) ; si besoin, découper côté appli en paquets de 6 à 8 patients (ou ~8 000 caractères), ou demander à l'IA des repères de découpe plutôt que la recopie intégrale.
- **Taille / risque** : moyenne / moyen. **Statut** : plausible (estimation).

### M10 — Lecteurs PDF jamais libérés

- **Où** : `src/app.ts:521` et `src/moteur.ts:65` (`getDocument` sans `destroy()` ; PDF.js 4.10 crée un lecteur, un *worker*, par document : `node_modules/pdfjs-dist/build/pdf.mjs:11414`).
- **Scénario (reproduit)** : 4 ouvertures de « Voir le bilan complet » → 4 lecteurs actifs ; chaque résumé automatique en ajoute un. Sur une journée sans fermer l'appli : des dizaines.
- **Conséquence** : mémoire qui grossit ; Android ou iOS peuvent fermer et relancer l'appli en arrière-plan, ce qui jette ce qui n'est qu'en mémoire (M1).
- **Correction** : `pdf.destroy()` à la fermeture de la visionneuse et à la fin de `pdfPourIA` (ou un lecteur unique partagé).
- **Taille / risque** : petite / faible. **Test** : AUDIT 3 inversé (au plus un lecteur après fermeture).

### F1 — Séance orpheline après suppression ou fusion d'un patient

- **Où** : `src/db.ts:106-116` (supprimer un patient), `:128-144` (supprimer son dernier bilan), `:158-171` (« Oui, même personne ») ; `src/fusion.ts:44-45` (« une modification l'emporte sur une suppression » vaut élément par élément, pas pour le dossier entier).
- **Scénario (reproduit)** : le patient est supprimé sur la tablette pendant que l'iPhone, hors connexion, lui ajoute une séance (ou modifie l'une de ses séances ; ou la tablette répond « Oui, même personne » pendant que l'iPhone note une séance dans l'ancien dossier). Après échange : la séance existe sur tous les appareils mais son dossier n'existe plus → invisible.
- **Correction** : à la réception d'une suppression de dossier, ne pas l'appliquer si des séances non supprimées y renvoient (le dossier repart comme modifié) ; plus un contrôle de réparation qui signale ou rattache les séances orphelines.
- **Taille / risque** : moyenne / moyen. **Test** : scénario « orpheline » de `partage.test.ts` inversé.

### F2 — Changement écrasé pendant la réception d'un échange

- **Où** : `src/synchro.ts:123-132` (état local lu, puis écriture dans une autre transaction ; la copie du jour, faite entre les deux à la première écriture de la journée, élargit la fenêtre).
- **Scénario (reproduit en forçant la fenêtre)** : un rendez-vous posé sur la tablette pile pendant qu'elle range un changement du même dossier venu de l'iPhone disparaît.
- **Correction** : relire la valeur locale et fusionner dans la transaction d'écriture.
- **Taille / risque** : moyenne / moyen. Rare (fenêtre de quelques dizaines de millisecondes).

### F3 — Rendez-vous passés effacés

- **Où** : `src/regles.ts:213-217` (`rdvsAVenir` ne garde que l'avenir), utilisé pour **écrire** par `src/app.ts:302` (modifier ou effacer le prochain rendez-vous) et `src/moteur.ts:223` (rendez-vous dicté). L'agenda (`src/agenda.ts:130`) et « Même personne » (`src/db.ts:166`) gardent, eux, le passé.
- **Scénario (reproduit)** : un rendez-vous dicté efface tous les rendez-vous passés du patient ; dans l'agenda, les jours déjà passés de la semaine perdent certains patients et pas d'autres.
- **Conséquence** : historique incohérent ; le futur suivi des absences (« Madame X absente ce jour ») a besoin des rendez-vous passés.
- **Correction** : ne plus filtrer à l'écriture (l'affichage filtre déjà). Petit effet visible : l'agenda des jours passés redevient complet.
- **Taille / risque** : petite / faible. À faire avant le chantier « absences ».

### F4 — Montée de version de la base sans garde

- **Où** : `src/db.ts:29-41` (`openDB` sans `blocking`, `blocked` ni `terminated`).
- **Scénario** : à la prochaine version de la base (le suivi de l'évolution peut en demander une), si une autre fenêtre de Muninn reste ouverte sur le même appareil (onglet Chrome du PC et appli installée), la nouvelle version attend indéfiniment : liste vide, sans message.
- **Correction** : fermer la vieille connexion quand une nouvelle version la demande (et proposer de recharger), signaler un blocage.
- **Taille / risque** : petite / faible. **Statut** : plausible.

### F5 — Bilan déposé sur un appareil sans IA

- **Où** : `src/moteur.ts:147` (seul l'appareil d'origine résume automatiquement).
- **Scénario** : bilan ajouté à la maison dans Chrome sur le PC, où le code d'accès de l'IA n'est peut-être pas réglé (les réglages de l'IA ne sont pas partagés) → personne ne le résume tout seul ; la tablette affiche « Il le sera dès que la tablette sera connectée à internet », ce qui est alors faux.
- **Correction** : vérifier et régler l'IA sur le PC ; dans le code, laisser un autre appareil résumer un bilan resté sans résumé plus de 15 minutes.
- **Taille / risque** : petite / faible. **Statut** : plausible.

### F6 — Textes très longs tronqués sans le dire

- **Où** : `src/ia.ts:370` et `:387` (dictée coupée à 60 000 caractères ; le contrôle des 60 % passe encore jusqu'à ~100 000) ; `src/ia.ts:296` et `:321` (séance coupée à 8 000 caractères, hors « À venir » envoyé à part ; la mise au propre partielle passe le seuil de 35 %).
- **Scénario (reproduit)** : dictée de 66 093 caractères → 60 000 rangés, sans erreur ; séance de 9 335 caractères → la fin (« Exercices à la maison… ») n'est jamais vue, et une mise au propre de 3 441 caractères s'affiche à la place du texte.
- **Conséquence** : peu probable (une heure de dictée groupée, un quart d'heure pour une séance), mais perte silencieuse.
- **Correction** : refuser (ou découper) au-delà des limites ; comparer les seuils au texte réellement envoyé.
- **Taille / risque** : petite / faible.

### F7 — Ce que l'IA « apprend » n'est pas le plus récent ; liste des patients coupée au hasard

- **Où** : `src/moteur.ts:115-116` et `src/ia.ts:140` (les « 60 dernières » corrections et lectures confirmées sont prises dans l'ordre des identifiants des bilans, donc au hasard) ; `src/moteur.ts:267` et `src/ia.ts:356` (la dictée reçoit au plus 400 patients, dans le même ordre quelconque).
- **Scénario** : au-delà de 60 corrections, la plus récente peut ne pas être envoyée (reproduit) ; au-delà de 400 patients (dans un à deux ans), des patients ayant rendez-vous ce jour-là peuvent manquer dans la liste donnée à l'IA (tracé).
- **Correction** : trier par date (`quand`, `ajoute`) ; patients vus ce jour-là en tête de liste.
- **Taille / risque** : petite / faible.

### F8 — Performances dans un an

Voir les mesures au § 6.4. Aujourd'hui (21 patients) tout est instantané ; la gêne commencera vers 150 patients et 2 500 séances. **Correction** : en plusieurs petites étapes (plan, étape 19). **Taille / risque** : grosse, découpée / moyen.

### F9 — Hygiène de sécurité et de confidentialité

- **(a)** Services du PC lancés en SYSTEM (`public/pc/installer.ps1:45`) : une faille dans Muninn du PC ou dans Whisper donnerait tous les droits sur le PC. → compte de service limité, droits seulement sur `C:\ProgramData\Muninn` (moyenne, à essayer devant le PC).
- **(b)** Dépendances Python figées seulement pour `faster-whisper` et `av` (`installer.ps1:81`) : une réinstallation peut tirer une nouvelle version d'une autre bibliothèque (même type de panne qu'`av` 19). → figer toute la liste (fichier de contraintes tiré de l'installation qui marche).
- **(c)** Son temporaire écrit dans le dossier temporaire de Windows (`public/pc/voix.py:126`) : effacé après la transcription, mais il reste si Whisper plante. → l'écrire dans `C:\ProgramData\Muninn`, déjà protégé.
- **(d)** Claude Code sur Railway lancé sans `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` (`serveur/claude.mjs:29-34`) : vérifications de mise à jour et statistiques d'usage inutiles ici ; à couper par principe (accélère aussi chaque lancement).
- **(e)** Pas de politique de sécurité du contenu (CSP) dans `server.mjs:30-35` : défense en profondeur seulement, car tous les affichages relus passent par `esc()`.
- **(f)** Données supprimées gardées sur le PC : PDF de `fichiers/` jamais effacés, ancienne valeur gardée dans `donnees.json` (`muninn-pc.mjs:147`), 60 copies. Utile pour récupérer, mais aucun effacement définitif possible si un patient le demande.
- **(g)** Disque du PC : chiffrement « à vérifier » (REPRISE) ; sans lui, un vol du PC expose tous les dossiers en clair.
- **(h)** PDF des transmissions envoyé par messagerie sans mot de passe (un PDF protégé est possible, à discuter).

### F10 — Deux fenêtres de Muninn sur le même appareil

- **Où** : `src/moteur.ts:7-8` (travaux en cours connus de la seule fenêtre) ; `src/synchro.ts:85-96` (un échange à la fois, par fenêtre).
- **Scénario** : sur le PC, un onglet Chrome et l'appli installée ouverts ensemble : un même bilan peut être résumé deux fois (quota), deux échanges peuvent se croiser.
- **Correction** : verrou commun aux fenêtres (`navigator.locks`).
- **Taille / risque** : petite / faible. **Statut** : plausible.

### F11 (Info) — Rangement au prénom seul

`src/regles.ts:283-295` : « un seul Marc dans l'appli → rangé chez lui, même sans rendez-vous ce jour-là » (règle souple choisie par Corentin). Un nouveau patient Marc, pas encore créé, serait rangé chez l'autre Marc ; le récapitulatif le montre sans le souligner. Proposition (visible, à valider) : marquer « rangé au prénom seul » dans le récapitulatif quand le patient n'avait pas rendez-vous ce jour-là.

---

## 4. Plan de nettoyage

Chaque étape est indépendante, testée avant d'être faite, et ne change rien à l'écran (sauf mention). Une étape = une version, mise en production seulement sur « mets en production ». Les étapes 4 à 12 sont petites et sans risque : elles peuvent être intercalées plus tôt si Corentin préfère sentir vite la différence au quotidien.

| Étape | Ce qui change (constats) | Tests à écrire d'abord | Taille / risque |
|---|---|---|---|
| 0 | **Filet de sécurité** : reprendre les scripts de l'annexe B comme tests du dépôt (`src/synchro.test.ts` avec un vrai Muninn du PC, tests d'écran `tests/e2e/audit.spec.ts`) ; ceux qui décrivent un défaut sont marqués « défaut connu » (`it.fails`, `test.fail`) et deviennent normaux à la correction. Aucun changement de l'appli. | ceux de l'annexe B | petite / nul |
| 1 | Muninn du PC : écriture sûre (`fsync`) et démarrage de secours sur `.tmp` puis dernière copie lisible (E2). Corentin relance ensuite la ligne d'installation sur le PC. | fichier tronqué, vide, `.tmp` abîmé → démarre, garde le fichier abîmé | petite / faible |
| 2 | Partage : liaison sans version commune, le PC fait foi (C1). | restaurer puis relier ; délier puis relier ; tablette pleine → PC vide ; appareil vide → PC plein | moyenne / moyen |
| 3 | Partage : identité de la base du PC, recul détecté, « À jour » seulement sans refus (E1). Message visible seulement en cas de panne. | PC remis à une copie → erreur signalée ; 3 refus → pas « À jour » | moyenne / moyen |
| 4 | Dictée : garder les 30 dernières dictées d'origine dans la base (E3, partie 1). | après rangement, la dictée d'origine est retrouvable ; « Annuler » inchangé | petite / faible |
| 5 | Voix : enregistrement non transcrit gardé dans la base ; écran gardé allumé pendant l'enregistrement (M1 partie 2, M2). | échec puis rechargement → enregistrement reproposé ; `wakeLock` demandé puis relâché | petite / faible |
| 6 | Fiche : repère unique « saisie en cours » contre les redessins (M7, A1). | AUDIT 1a et 1b ; formulaire de séance toujours protégé | petite / faible |
| 7 | IA : reprise automatique des séances non analysées, `origine` sur les séances (M3). | AUDIT 5 ; séance d'un autre appareil ignorée ; hors ligne puis en ligne | moyenne / faible |
| 8 | « Annuler cette dictée » limité aux dossiers de la dictée (M4). | AUDIT 4 | petite / faible |
| 9 | Copies : la copie « avant le retour » n'est plus écrasée par un second retour (M5). | deux retours puis « Annuler » → travail du jour retrouvé | petite / faible |
| 10 | Lecteurs PDF libérés après usage (M10). | AUDIT 3 : au plus un lecteur actif | petite / faible |
| 11 | Délais d'attente côté appli ; arrêt de Claude Code quand l'appli coupe (M8). | IA qui ne répond jamais → message, dictée gardée ; client coupé → faux Claude Code arrêté | petite / faible |
| 12 | Serveur : limite d'essais fiable et plafond global ; trafic non essentiel de Claude Code coupé (M6, F9-d). | `X-Forwarded-For` changeant → `429` ; variable présente dans l'environnement du faux Claude Code | petite / faible |
| 13 | Dictée : contrôle par patient annoncé et par couverture des mots (E3, partie 2), réglé sur de vraies dictées anonymisées. | IA qui oublie un patient → refusé ; dictées réelles → acceptées | moyenne / moyen |
| 14 | Partage : fusion dans la transaction d'écriture (F2) ; suppression de dossier qui respecte ses séances (F1). | fenêtre forcée ; scénario orpheline | moyenne / moyen |
| 15 | Base : montée de version sans blocage (F4), **avant** toute nouvelle version de la base. | deux pages, la seconde demande une version plus haute → pas de blocage | petite / faible |
| 16 | IA : longueurs maximales vérifiées, tri par date des corrections et des patients (F6, F7). | scripts F6 et F7 inversés | petite / faible |
| 17 | Entretien sans effet : module d'enregistrement commun (A2), `modifierDossier(id, f)` en une transaction (A3), utilitaires de dates communs et code mort retiré (A4). | tests existants verts, plus un test par fonction déplacée | moyenne / faible |
| 18 | PC : dépendances Python figées, son temporaire dans le dossier protégé ; plus tard compte de service limité (F9 a-c). À faire avec Corentin devant le PC. | installation dans un environnement neuf → mêmes versions | petite à moyenne / faible à moyen |
| 19 | Performances, avant ~150 patients (F8, A5), en 4 ou 5 étapes : cache des données en mémoire ; liste des fichiers gardée dans chaque copie ; journal des éléments modifiés au lieu de tout comparer ; empreinte du texte source au lieu de sa recopie ; copie hors de Chrome écrite par morceaux. | banc d'essai au volume d'une année (§ 6.4) avec seuils de temps | grosse en petites étapes / moyen |

**À décider avec Corentin (petit changement visible)** : question avant de couper un enregistrement en cours (M1) ; message et remise à niveau guidée si le PC est revenu en arrière (E1) ; texte de confirmation des retours en arrière sur un appareil relié (C1) ; mention « rangé au prénom seul » dans le récapitulatif (F11) ; rendez-vous passés gardés, donc de nouveau visibles dans l'agenda des jours passés (F3, avant le chantier « absences ») ; découpage des grosses dictées si la mesure le justifie (M9) ; PDF des transmissions protégé (F9-h).

---

## 5. Ce qui est solide (à ne pas toucher)

- **Base locale** : montées de version cumulatives (`if (ancienne < N)`), testées de la version 3 à la 4 ; nom `mes-patients` gardé ; suppression d'un dossier et de ses séances dans une seule transaction.
- **Partage** : numéros de modification plutôt qu'horloges (aucune décision ne dépend de l'heure des appareils : des horloges décalées sont sans effet) ; fusion à trois versions élément par élément (rendez-vous par jour, corrections, points validés) ; « une modification l'emporte sur une suppression » ; PDF envoyés avant le bilan qui y renvoie ; un seul échange à la fois avec relance ; envois par paquets ; champs inconnus conservés (utile quand un appareil n'est pas encore à jour).
- **Muninn du PC** : file d'écriture unique, écriture `.tmp` puis renommage, copie quotidienne gardée 60 jours, code de 60 bits comparé en temps constant, écoute sur `127.0.0.1` seulement derrière Tailscale, dossier protégé par ses droits, aucune dépendance.
- **Copies de sécurité** : copie interne quotidienne et retour annulable, fichiers gardés tant qu'une copie y renvoie ; fichier chiffré solide (AES-GCM 256, PBKDF2 600 000 tours, numéro de morceau authentifié, copie tronquée refusée), déjà testé.
- **Claude Code sur Railway, verrouillage vérifié en vrai** (version 2.1.292 face à un faux point d'accès) : aucun `CLAUDE.md` lu malgré le dossier de travail du dépôt, un seul outil (la réponse structurée), aucun serveur MCP, rien de conservé, demande passée par l'entrée standard, environnement sans secret, arrêt du groupe de processus à 5 minutes, une génération à la fois. Une consigne glissée dans un bilan ou une dictée ne peut au pire que fausser la réponse, dans le format imposé : aucune action possible.
- **Affichage** : tout texte venant des données ou de l'IA passe par `esc()` (tous les `innerHTML` relus) ; aucune faille d'injection trouvée.
- **Serveur Railway** : pas de sortie du dossier `dist/` (testé), cache maîtrisé (page et service worker revérifiés), arrêt propre sur SIGTERM, en-têtes de sécurité, micro réservé à l'appli, aucune donnée patient écrite.
- **IA** : garde-fous de 35 % (séance) et 70 % (correction), schémas JSON imposés, calendrier fourni (l'IA lit la date, ne la calcule pas), rendez-vous posé seulement s'il est à venir et que la séance est la plus récente, analyse ignorée si la séance a changé entre-temps, points « à vérifier » du moment gardés lors du report d'une correction.
- **Choix figés respectés** : mises à jour « au bandeau », `pdfjs-dist` 4.10.38, `av==18.1.0`, base `mes-patients`, rien sur Railway, pas de relecture avant rangement. Le correctif 1.2.1 (micro coupé) est correct.
- **Règles métier** (`src/regles.ts`) pures et bien testées ; 120 + 53 tests rapides, avec faux Claude Code, faux Whisper et vrai Muninn du PC : aucune vraie requête.

---

## 6. Architecture, tests, performances

### 6.1 Architecture et entretien

- **A1 — `src/app.ts` (541 lignes)** : liste, fiche, séances, rendez-vous, homonymes, visionneuse et ajout de bilans dans un seul fichier, avec un état en drapeaux (`formOpen`, `editing`, `rdvOpen`, `homoOpen`, `nomOpen`, `dicteeVue`) et un redessin complet de la fiche à chaque changement. Chaque nouveau champ doit penser à son drapeau : c'est la cause directe de M7, et le suivi de l'évolution ajoutera des éléments à la fiche. D'abord le repère unique « saisie en cours » (étape 6), plus tard un découpage en modules (liste, fiche, séances).
- **A2 — Enregistreur de voix en double** : `src/dictee.ts:127-177` et `src/voix-seance.ts` (démarrer, arrêter, chrono, réessayer, effacer) avec deux comportements différents : la dictée groupée continue d'enregistrer quand on la ferme, la séance coupe. Un module commun portera la garde en base (M1) et l'écran allumé (M2) pour les deux.
- **A3 — Écritures sur une lecture ancienne** : `db.setRdvs` reçoit une liste complète calculée à partir d'un dossier lu plus tôt (`app.ts:302`, `agenda.ts:130` qui garde la liste lue à l'ouverture de la fenêtre « placer », `moteur.ts:219-223`, `dictee.ts:269-272`) ; `majBilan` et `majSeance` lisent puis écrivent en deux transactions (`db.ts:118-125`, `193-200`). Une fonction `modifierDossier(id, f)` qui lit et écrit dans la même transaction supprime toute cette famille de courses.
- **A4 — Petits doublons et code mort** : `jourLong` écrit 5 fois, `jourCourt` 3, `duree` 2, `pluriel` 2, `$` 5 ; `hhmm` (`regles.ts:304`) jamais utilisé ; `serveur/transcription.mjs` dormant (`WHISPER_URL` non réglé : à garder comme secours documenté ou à retirer) ; `CLAUDE.md` cite encore `creneauxLibres`, disparu. Le contrôle du code et la lecture du corps sont écrits deux fois (`server.mjs`, `muninn-pc.mjs`) : à garder en double (Muninn du PC doit rester un seul fichier sans dépendance) mais à corriger ensemble (M6).
- **A5 — Texte de séance recopié** : `propre_source` et `bref_source` contiennent chacun tout `contenu` (`moteur.ts:215-216`) : chaque séance pèse trois fois son texte dans la base, les échanges, les copies et les comparaisons. Remplacer par une empreinte courte, en acceptant les deux formes pendant la transition (appareils pas encore à jour).

### 6.2 Préparer le suivi de l'évolution

- **Où brancher** : ajouter l'extraction de l'évolution à la **même** demande que la mise au propre d'une séance (pas de demande ni de quota en plus) : champs facultatifs de la séance, par exemple `evolution: { douleur, tendance: "mieux" | "pareil" | "moins bien", points: [...] }`, avec une empreinte du texte source comme pour `propre`. La synthèse par patient se fait ensuite sur ses séances, sans relire toute la base.
- **Prérequis tirés de l'audit** : M3 (sans reprise automatique, des séances n'auraient jamais leurs données d'évolution) ; F1 (des séances orphelines fausseraient l'historique) ; M7 et A1 (un nouveau bloc sur la fiche sans perdre les saisies) ; F4 (si une nouvelle version de base est nécessaire) ; A5 (sinon une quatrième recopie du texte par séance) ; § 6.4 (une alerte calculée chaque matin pour tous les patients doit éviter de relire toute la base à répétition).
- **Séances anciennes** : rattrapage progressif par petits paquets (une fois par jour) pour ne pas vider le quota Pro.
- **Appareils pas à jour** : l'iPhone peut rester quelques jours sur une ancienne version (mises à jour au bandeau). Les nouveaux champs doivent rester facultatifs ; le partage les conserve déjà (champs inconnus gardés à la fusion), et une séance modifiée sur un appareil ancien verra son évolution recalculée grâce à l'empreinte du texte source.

### 6.3 Tests manquants (ce qui est critique et non couvert)

- **Partage** (`src/synchro.ts`) : aucun test unitaire ; un seul test d'écran, sur le chemin heureux. À ajouter : les 6 scénarios de l'annexe B (avec un vrai Muninn du PC, moins de 2 secondes en tout), plus de 500 changements (pagination), trois refus de suite, PDF absent du PC, coupure au milieu d'un envoi.
- **Muninn du PC** : démarrage sur fichier abîmé ; numéros qui ne reculent jamais ; deux appareils qui envoient en même temps.
- **Moteur de l'IA** (`src/moteur.ts`) : aucun test unitaire : règle d'origine des bilans, reprise après échec, pose du rendez-vous (séance la plus récente, date passée), report d'une correction pendant une autre modification.
- **Écrans** : redessin pendant une saisie (AUDIT 1a, 1b) ; navigation pendant un enregistrement (AUDIT 2) ; lecteurs PDF (AUDIT 3) ; « Annuler cette dictée » après un autre changement (AUDIT 4) ; reprise d'une analyse échouée (AUDIT 5).
- **Copies** : deux retours de suite ; restauration de fichier sur un appareil relié.
- **Serveur** : limite d'essais avec en-tête forgé ; arrêt de Claude Code quand l'appli coupe.
- **IA** : dictée dont l'IA oublie un patient ; textes au-delà des limites.

### 6.4 Performances (mesures)

- **Aujourd'hui** (21 patients, une cinquantaine de séances) : tout est instantané.
- **Volume d'une année** (hypothèse : 300 patients, 5 000 séances ; texte de la base ~20 Mo, dont le texte de chaque séance compté trois fois, A5). Calculs mesurés sur la machine de l'audit ; une tablette est 2 à 4 fois plus lente :
  - comparaison de tout ce qui est partagé, à chaque échange (chaque minute et 2 s après chaque changement) : **123 ms**, plus la lecture de 2 × 20 Mo dans la base (`src/synchro.ts:141-148`) ;
  - tri des fichiers à garder, à chaque réception de changements et à chaque suppression : relecture des 7 copies internes, ~140 Mo, **~110 ms** d'analyse plus la lecture (`src/db.ts:281-290`) ;
  - liste des patients, recalculée même quand elle est cachée : **20 ms** ; « Ma journée » : **11 ms** ;
  - toute la base relue à chaque changement et à chaque redessin (`src/db.ts:53-57`, `src/app.ts:62-63`) ;
  - copie hors de Chrome : chaque morceau est chiffré à part, mais tous restent en mémoire jusqu'à la création du fichier (`src/fichier-copie.ts:27-37`), et de même à la restauration (`:58-59`) : avec 300 bilans de 1 à 3 Mo, 300 à 900 Mo → risque de plantage, surtout sur l'iPhone.
- **Seuil d'alerte** : vers 150 patients et 2 500 séances, les échanges deviendront perceptibles (petites saccades chaque minute).
- **Pistes** (étape 19) : cache des données en mémoire invalidé à chaque écriture ; liste des fichiers gardée dans chaque copie (plus de relecture) ; journal des éléments modifiés depuis le dernier échange (au lieu de tout comparer) ; empreinte du texte source (A5) ; copie hors de Chrome écrite par morceaux.

---

## Annexe A — Vérifications faites (résultats bruts)

| Vérification | Outil | Résultat |
|---|---|---|
| État de départ | `npm test`, `npm run test:e2e` | 120/120, 53/53 |
| Témoin : séance de la tablette reçue par le téléphone | `partage.test.ts` (vrai `db.ts` + `synchro.ts` + vrai `muninn-pc.mjs`) | correct |
| PC remis à une copie (E1) | idem | tablette `erreur: null` (« À jour ») ; PC garde « version 1 » ; séance 2 jamais reçue ; téléphone voit « version 1 » |
| Restaurer puis relier (C1) | idem | séance remise à « texte dicté, avec une erreur » partout ; patient supprimé revenu |
| Délier puis relier (C1) | idem | « version 1 » remise sur la tablette |
| Suppression contre ajout (F1) | idem | 0 dossier, 1 séance, sur les deux appareils |
| Écriture pendant la réception (F2) | idem, fenêtre forcée | rendez-vous du 12 novembre perdu |
| `donnees.json` tronqué / vide / `.tmp` abîmé (E2) | lancement direct | code de sortie 1, `SyntaxError`, trois fois |
| Limite des essais (M6) | `curl` sur `server.mjs` et `muninn-pc.mjs` | même adresse : 401 ×5 puis 429 ; adresse changeante : 20 × 401 |
| Verrouillage de Claude Code | vrai Claude Code 2.1.292, faux point d'accès | pas de `CLAUDE.md` envoyé ; seul outil `StructuredOutput` ; `max_tokens` 128 000 |
| Deux retours en arrière (M5) | `divers.test.ts` | il ne reste que « séance du samedi » |
| Rendez-vous passés (F3) | `divers.test.ts` | `2020-01-06` effacé |
| Longueurs (F6) | `divers.test.ts` | dictée 66 093 → 60 000 rangés ; séance 9 335 → propre 3 441 acceptée |
| « 60 dernières » (F7) | `divers.test.ts` | la plus récente absente du prompt |
| Patient oublié (E3) | `dictee-garde.test.ts` | 4 passages sur 5 acceptés |
| Saisie effacée (M7) | `audit.spec.ts` 1a, 1b | champ disparu dans les deux cas |
| Enregistrement jeté (M1) | `audit.spec.ts` 2 | pas de question, 0 séance |
| Lecteurs PDF (M10) | `audit.spec.ts` 3 | 4 lecteurs actifs après 4 ouvertures fermées |
| Annuler la dictée (M4) | `audit2.spec.ts` 4 | rendez-vous de Lucie effacé |
| Séance non reprise (M3) | `audit2.spec.ts` 5 | après réouverture : texte brut, aucun rendez-vous |
| Volume d'une année (F8) | `perf.test.ts` | 123 ms / 20 ms / 11 ms / ~110 ms |

Aucun fichier du dépôt n'a été modifié : les scripts ont tourné depuis un dossier de brouillon (avec un lien vers `node_modules`), le dépôt est resté propre (`git status`).

## Annexe B — Scripts de reproduction

À reprendre à l'étape 0 comme tests du dépôt. Ils sont écrits pour **constater** les défauts d'aujourd'hui : à chaque correction, inverser l'attente correspondante. Les chemins absolus `/home/user/Projet-1/…` sont à remplacer par des chemins relatifs une fois les fichiers rangés dans le dépôt. Lancement depuis un dossier contenant ces fichiers et un lien `node_modules` vers celui du projet :

- `SCRATCH=$PWD npx vitest run --config vitest.config.mts`
- `npx playwright test --config playwright.config.ts` (après `npm run build` dans le projet)

<details><summary><code>vitest.config.mts</code> — configuration Vitest du dossier de scripts</summary>

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["*.test.ts"], testTimeout: 60000, hookTimeout: 60000, fileParallelism: false },
  server: { fs: { strict: false } }
});
```

</details>

<details><summary><code>pc.ts</code> — lance le vrai Muninn du PC dans un dossier temporaire</summary>

```ts
// Lance le vrai Muninn du PC (public/pc/muninn-pc.mjs) dans un dossier du brouillon
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const CODE = "AUDI-TPCM-UNIN";
export type PC = { url: string; dossier: string; proc: ChildProcess; arreter: () => Promise<void> };
let port = 4900;
export async function lancerPC(dossier?: string): Promise<PC> {
  const d = dossier ?? mkdtempSync(join(process.env.SCRATCH ?? tmpdir(), "pc-"));
  const p = port++;
  const proc = spawn(process.execPath, ["/home/user/Projet-1/public/pc/muninn-pc.mjs"], {
    env: { ...process.env, MUNINN_DOSSIER: d, MUNINN_PORT: String(p), MUNINN_CODE: CODE }, stdio: ["ignore", "pipe", "pipe"]
  });
  let sortie = ""; proc.stdout!.on("data", x => sortie += x); proc.stderr!.on("data", x => sortie += x);
  const url = `http://127.0.0.1:${p}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + "/")).ok) break; } catch { /* pas encore */ }
    if (proc.exitCode !== null) throw new Error("Le PC s'est arrêté au démarrage : " + sortie);
    await new Promise(r => setTimeout(r, 50));
  }
  return { url, dossier: d, proc, arreter: () => new Promise(r => { if (proc.exitCode !== null) return r(); proc.on("exit", () => r()); proc.kill("SIGTERM"); }) };
}
export const etatPC = async (pc: PC) => (await fetch(pc.url + "/api/sync/changements?depuis=0", { headers: { Authorization: "Bearer " + CODE } })).json();
```

</details>

<details><summary><code>partage.test.ts</code> — partage entre appareils : témoin, C1, E1, F1, F2</summary>

```ts
/* Audit : scénarios de partage entre appareils, joués avec le vrai code de l'appli (src/db.ts, src/synchro.ts)
   et le vrai Muninn du PC (public/pc/muninn-pc.mjs). Chaque « appareil » a sa propre base IndexedDB (fake-indexeddb). */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODE, etatPC, lancerPC, type PC } from "./pc";

type DB = typeof import("/home/user/Projet-1/src/db.ts");
type Sync = typeof import("/home/user/Projet-1/src/synchro.ts");
type Appareil = { db: DB; sync: Sync };

async function appareil(): Promise<Appareil> {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const db = await import("/home/user/Projet-1/src/db.ts");
  const sync = await import("/home/user/Projet-1/src/synchro.ts");
  await db.appareil();   // ouvre sa base maintenant, dans sa propre fabrique
  return { db, sync };
}
const echanger = async (a: Appareil) => { await a.sync.synchroniser(); return a.sync.etatSync(); };
const seance = async (a: Appareil, id: string) => (await a.db.tout()).seances.find(s => s.id === id);

const pcs: PC[] = [];
afterEach(async () => { for (const p of pcs.splice(0)) await p.arreter(); });
const nouveauPC = async (dossier?: string) => { const p = await lancerPC(dossier); pcs.push(p); return p; };

describe("partage : scénarios de l'audit", () => {
  it("témoin : une séance notée sur la tablette arrive sur le téléphone", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s = await tab.db.ajouterSeance(p.id, "2026-11-03", "douleur 4 sur 10");
    await tab.sync.relier(pc.url, CODE);
    expect(tab.sync.etatSync().erreur).toBeNull();
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    expect((await seance(tel, s.id))?.contenu).toBe("douleur 4 sur 10");
  });

  it("PC remis à une copie plus ancienne (donnees.json restauré) : les échanges échouent en silence", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "version 1");
    await tab.sync.relier(pc.url, CODE);
    copyFileSync(join(pc.dossier, "donnees.json"), join(pc.dossier, "ancienne-copie.json"));   // comme une copie de copies/

    await tab.db.majSeance(s1.id, { contenu: "version 2" });
    const s2 = await tab.db.ajouterSeance(p.id, "2026-11-04", "séance 2");
    expect((await echanger(tab)).erreur).toBeNull();

    // le PC repart de la copie de la veille (réparation à la main, PC réinstallé…)
    await pc.arreter();
    copyFileSync(join(pc.dossier, "ancienne-copie.json"), join(pc.dossier, "donnees.json"));
    const pc2 = await nouveauPC(pc.dossier);
    await tab.db.ecrireParametre("sync_adresse", pc2.url);   // même PC, nouveau port dans ce test seulement

    await tab.db.majSeance(s1.id, { contenu: "version 3" });
    const etat = await echanger(tab);
    const surPC = await etatPC(pc2);
    const s1PC = surPC.changements.find((c: { cle: string }) => c.cle === "seances/" + s1.id);
    const s2PC = surPC.changements.find((c: { cle: string }) => c.cle === "seances/" + s2.id);
    console.log("état affiché sur la tablette :", etat, "| séance 1 sur le PC :", s1PC?.valeur?.contenu, "| séance 2 sur le PC :", s2PC ? "présente" : "absente");
    expect(etat.erreur).toBeNull();                       // la tablette affiche « À jour avec le PC »
    expect(s1PC.valeur.contenu).toBe("version 1");        // … mais le PC garde l'ancienne version
    expect(s2PC).toBeUndefined();                         // … et n'a jamais reçu la séance 2

    const tel = await appareil();
    await tel.sync.relier(pc2.url, CODE);
    expect((await seance(tel, s1.id))?.contenu).toBe("version 1");   // le téléphone voit l'ancienne version
    expect(await seance(tel, s2.id)).toBeUndefined();               // et pas la séance 2
  });

  it("tablette neuve : restaurer le fichier de copie puis relier au PC remet partout les anciennes versions", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const q = await tab.db.creerPatient("Zoé Q.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-10-20", "texte dicté, avec une erreur");
    await tab.sync.relier(pc.url, CODE);
    const fichier = await tab.db.exporter();                      // « Copier hors de Chrome » du lundi

    await tab.db.majSeance(s1.id, { contenu: "texte corrigé le mardi" });
    await tab.db.supprimerPatient(q.id);                          // patient supprimé le mardi
    expect((await echanger(tab)).erreur).toBeNull();

    // la tablette est perdue ; sur la neuve : restauration du fichier, puis « Relier au PC »
    const neuve = await appareil();
    await neuve.db.importer(fichier);
    await neuve.sync.relier(pc.url, CODE);
    await echanger(tab);                                          // l'iPhone ou le PC reçoivent

    const surTab = await seance(tab, s1.id);
    const qRevenu = (await tab.db.tout()).dossiers.some(d => d.id === q.id);
    console.log("séance sur l'autre appareil :", surTab?.contenu, "| patient supprimé revenu :", qRevenu);
    expect(surTab?.contenu).toBe("texte dicté, avec une erreur");  // la correction du mardi est perdue partout
    expect(qRevenu).toBe(true);                                   // le patient supprimé est revenu partout
  });

  it("délier puis relier un appareil resté en arrière : ses vieilles versions écrasent les nouvelles", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "version 1");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    await tel.sync.delier();
    await tab.db.majSeance(s1.id, { contenu: "version 2, corrigée sur la tablette" });
    await echanger(tab);
    await tel.sync.relier(pc.url, CODE);                          // le téléphone est relié de nouveau
    await echanger(tab);
    console.log("séance sur la tablette après le retour du téléphone :", (await seance(tab, s1.id))?.contenu);
    expect((await seance(tab, s1.id))?.contenu).toBe("version 1");
  });

  it("patient supprimé sur un appareil pendant qu'un autre lui ajoute une séance : séance orpheline, invisible", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    await tab.db.ajouterSeance(p.id, "2026-11-02", "séance 1");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);

    const s2 = await tel.db.ajouterSeance(p.id, "2026-11-03", "séance notée sur le téléphone hors connexion");
    await tab.db.supprimerPatient(p.id);
    await echanger(tab);
    await echanger(tel);
    await echanger(tab);

    for (const [nom, a] of [["tablette", tab], ["téléphone", tel]] as const) {
      const t = await a.db.tout();
      console.log(nom, ": dossiers", t.dossiers.length, "séances", t.seances.length, "→ orpheline :", t.seances.some(s => s.id === s2.id && !t.dossiers.some(d => d.id === s.dossierId)));
      expect(t.dossiers).toHaveLength(0);
      expect(t.seances.map(s => s.id)).toEqual([s2.id]);
    }
  });

  it("une modification faite pendant la réception d'un échange est écrasée (fenêtre forcée)", async () => {
    const pc = await nouveauPC();
    const tab = await appareil();
    const p = await tab.db.creerPatient("Paul T.");
    const s1 = await tab.db.ajouterSeance(p.id, "2026-11-03", "dictée");
    await tab.sync.relier(pc.url, CODE);
    const tel = await appareil();
    await tel.sync.relier(pc.url, CODE);
    await tel.db.setRdvs(p.id, [{ d: "2026-11-10", h: "", p: "am" }]);   // le téléphone change le dossier
    await echanger(tel);

    // la tablette reçoit ; au même moment (entre la lecture et l'écriture de l'échange), elle enregistre un rendez-vous
    const vrai = tab.db.appliquerPartage;
    let fait = false;
    vi.spyOn(tab.db, "appliquerPartage").mockImplementation(async (e, b) => {
      if (!fait && e.length) { fait = true; await tab.db.setRdvs(p.id, [{ d: "2026-11-12", h: "", p: "pm" }]); }
      return vrai(e, b);
    });
    await echanger(tab);
    const d = (await tab.db.tout()).dossiers[0];
    console.log("rendez-vous de la tablette après l'échange :", JSON.stringify(d.rdvs));
    expect(fait).toBe(true);
    expect(d.rdvs.some(r => r.d === "2026-11-12")).toBe(false);   // le rendez-vous posé sur la tablette a disparu
  });
});
```

</details>

<details><summary><code>divers.test.ts</code> — copies (M5), rendez-vous passés (F3), longueurs (F6), « 60 dernières » (F7)</summary>

```ts
/* Audit : copies de sécurité, rendez-vous passés, garde-fous de l'IA (vrai code de l'appli). */
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import * as db from "/home/user/Projet-1/src/db.ts";
import * as moteur from "/home/user/Projet-1/src/moteur.ts";
import { lireAnalyse, lireDictee, promptDictee, promptSeance, systemeBilan } from "/home/user/Projet-1/src/ia.ts";

beforeEach(async () => { await db.fermer(); globalThis.indexedDB = new IDBFactory(); });

describe("copies de sécurité", () => {
  it("deux retours en arrière de suite : l'état d'avant le premier retour est perdu", async () => {
    const p = await db.creerPatient("Paul T.");
    await db.ajouterSeance(p.id, "2026-11-01", "séance du samedi");
    await db.copieDuJour("2026-11-02");                       // copie du dimanche
    await db.ajouterSeance(p.id, "2026-11-02", "séance du dimanche");
    await db.copieDuJour("2026-11-03");                       // copie du lundi
    await db.ajouterSeance(p.id, "2026-11-03", "séance du lundi (travail du jour)");
    await db.revenirA("2026-11-02");                          // 1er retour (fausse manœuvre)
    await db.revenirA("2026-11-03");                          // 2e retour : il essaie une autre copie
    await db.revenirA(db.AVANT_RETOUR);                       // « Annuler le retour en arrière »
    const textes = (await db.tout()).seances.map(s => s.contenu);
    console.log("après deux retours puis « Annuler » :", textes);
    expect(textes).not.toContain("séance du lundi (travail du jour)");
  });
});

describe("rendez-vous passés", () => {
  it("un rendez-vous dicté efface les rendez-vous passés du patient (historique perdu pour l'agenda et les absences)", async () => {
    const p = await db.creerPatient("Paul T.", [{ d: "2020-01-06", h: "", p: "am" }, { d: "2099-01-05", h: "", p: "am" }]);
    await moteur.rangerSeance(p.id, "2026-11-03", { nom: "Paul T.", contenu: "pour la prochaine séance dans une semaine", propre: "", resume: "", bref: "", rdvDate: "2099-01-12", rdvHeure: "", rdvDemi: "pm" });
    const rdvs = (await db.tout()).dossiers[0].rdvs.map(r => r.d);
    console.log("rendez-vous après la séance dictée :", rdvs);
    expect(rdvs).not.toContain("2020-01-06");
  });
});

describe("garde-fous de l'IA", () => {
  it("dictée groupée de plus de 60 000 caractères : la fin n'est pas envoyée et rien ne le signale", () => {
    const debut = "Avec Marc D. douleur 3 sur 10 renforcement. ".repeat(1500);   // ~67 000 caractères
    const fin = " Ensuite Lucie B. capsulite, mobilisation passive, pour la prochaine séance dans une semaine.";
    const texte = debut + fin;
    const prompt = promptDictee("2026-11-03", texte, [{ label: "Marc D.", vuCeJour: true }, { label: "Lucie B.", vuCeJour: true }]);
    expect(prompt.includes("Lucie B. capsulite")).toBe(false);                       // la fin n'est jamais vue par l'IA
    const seances = lireDictee({ seances: [{ nom: "Marc D.", extrait: debut.slice(0, 60000), propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }] }, texte);
    console.log("longueur dictée :", texte.length, "| rangé :", seances.reduce((n, s) => n + s.contenu.length, 0), "→ accepté sans erreur");
    expect(seances).toHaveLength(1);                                                 // accepté : le passage de Lucie est perdu
  });

  it("séance de plus de 8 000 caractères : la mise au propre, faite sur le début, est acceptée et affichée à la place du texte", () => {
    const contenu = "Mobilisation passive et actif aidé de l'épaule, douleur 4 sur 10. ".repeat(140) + " Exercices à la maison : élastique rouge, 3 séries. Pour la prochaine séance : tester la force.";
    const prompt = promptSeance("2026-11-03", contenu, false);
    expect(prompt.includes("tester la force")).toBe(true);        // le « À venir » est envoyé à part
    expect(prompt.includes("élastique rouge")).toBe(false);       // mais la fin de la note, avant lui, n'est jamais vue
    const a = lireAnalyse({ propre: "État du patient : douleur 4/10. " + "Fait en séance : mobilisation. ".repeat(110), resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }, contenu, false);
    console.log("longueur séance :", contenu.length, "| mise au propre retenue :", a.propre.length, "caractères");
    expect(a.propre.length).toBeGreaterThan(0);
  });

  it("les « 60 dernières » corrections renvoyées à l'IA suivent l'ordre des identifiants, pas la date", () => {
    const anciennes = Array.from({ length: 70 }, (_, i) => ({ point: "ancien " + i, correction: "x" }));
    const s = systemeBilan([...anciennes.slice(0, 5), { point: "LA PLUS RÉCENTE", correction: "y" }, ...anciennes.slice(5)]);
    expect(s.includes("LA PLUS RÉCENTE")).toBe(false);   // la liste vient de db.tout(), rangée par identifiant (aléatoire)
  });
});
```

</details>

<details><summary><code>dictee-garde.test.ts</code> — patient oublié par l'IA dans la dictée groupée (E3)</summary>

```ts
import { expect, it } from "vitest";
import { lireDictee } from "/home/user/Projet-1/src/ia.ts";
it("l'IA oublie entièrement un patient sur cinq : la dictée est acceptée", () => {
  const passages = ["Marc", "Lucie", "Paul", "Odile", "Sylvie"].map(n => [n, `douleur à 3 sur 10, mobilisation passive puis renforcement des rotateurs externes, exercices à la maison avec l'élastique, pour la prochaine séance travail proprioceptif (${n})`]);
  const texte = passages.map(([n, t]) => `Avec ${n}, ${t}.`).join(" ");
  const reponse = { seances: passages.slice(0, 4).map(([n, t]) => ({ nom: n, extrait: t, propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null })) };
  const s = lireDictee(reponse, texte);
  console.log("passages rangés :", s.map(x => x.nom).join(", "), "| Sylvie oubliée, aucune erreur");
  expect(s).toHaveLength(4);
});
```

</details>

<details><summary><code>perf.test.ts</code> — volume d'une année (F8)</summary>

```ts
/* Audit : coût des calculs faits à chaque changement, avec le volume d'une année (300 patients, 5 000 séances). */
import { it } from "vitest";
import { stable } from "/home/user/Projet-1/src/fusion.ts";
import { journee, lignesListe, type Bilan, type Dossier, type Seance } from "/home/user/Projet-1/src/regles.ts";

const texte = (n: number) => "Mobilisation passive de l'épaule droite, douleur 3 sur 10, renforcement des rotateurs externes. ".repeat(Math.ceil(n / 96)).slice(0, n);
it("volume d'une année", () => {
  const dossiers: Dossier[] = Array.from({ length: 300 }, (_, i) => ({ id: "d" + i, label: "Patient" + i + " X.", rdvs: [{ d: "2027-11-0" + (1 + i % 6), h: "", p: i % 2 ? "am" : "pm" }], homonyme: false, cree: "2026-11-03T08:00:00Z" }));
  const bilans: Bilan[] = dossiers.map((d, i) => ({ id: "b" + i, dossierId: d.id, fichier: "Fiche Bilan - " + d.label, fichiers: [{ id: "f" + i, nom: "x.pdf", type: "application/pdf" }], ajoute: "2026-11-03T08:00:00Z", resume: { region: "Épaule D", coup_oeil: texte(300), chiffres: [{ label: "EVA", valeur: "5/10" }], sections: [{ titre: "Examen", items: [texte(200), texte(200)] }], a_verifier: [] }, valides: [], corrections: [] }));
  const seances: Seance[] = Array.from({ length: 5000 }, (_, i) => { const c = texte(800); return { id: "s" + i, dossierId: "d" + (i % 300), date: "2027-0" + (1 + i % 9) + "-1" + (i % 9), cree: "2027-01-01T00:00:00Z", contenu: c, propre: texte(900), propre_source: c, bref: texte(120), bref_source: c, avenir_resume: texte(100), avenir_source: texte(200), ia_ok: true }; });
  const json = JSON.stringify({ dossiers, bilans, seances });
  console.log("taille du texte de la base :", (json.length / 1e6).toFixed(1), "Mo (dont contenu recopié 3 fois par séance)");
  let t = performance.now();
  for (const x of [...dossiers, ...bilans, ...seances]) { stable(x); stable(x); }
  console.log("comparaison de tout le partage (chaque minute et 2 s après chaque changement) :", Math.round(performance.now() - t), "ms ici");
  t = performance.now(); lignesListe(dossiers, bilans, "", "2027-11-01"); for (const d of dossiers) seances.filter(s => s.dossierId === d.id).length;
  console.log("liste des patients (à chaque changement, même cachée) :", Math.round(performance.now() - t), "ms ici");
  t = performance.now(); journee(dossiers, bilans, seances, "2027-11-01"); journee(dossiers, bilans, seances, "2027-11-02");
  console.log("« Ma journée » (à chaque changement) :", Math.round(performance.now() - t), "ms ici");
  t = performance.now(); for (let i = 0; i < 7; i++) JSON.parse(json);
  console.log("relire 7 copies de sécurité pour trier les fichiers (nettoyerFichiers, à chaque réception du PC) : ~", Math.round(performance.now() - t), "ms ici (+ lecture IndexedDB)");
});
```

</details>

<details><summary><code>playwright.config.ts</code> — configuration Playwright (reprend celle du dépôt)</summary>

```ts
import base from "/home/user/Projet-1/playwright.config.ts";
const racine = "/home/user/Projet-1";
export default {
  ...base,
  testDir: "./e2e",
  outputDir: "./resultats-e2e",
  webServer: (base.webServer as object[]).map(w => ({ ...w, cwd: racine }))
};
```

</details>

<details><summary><code>e2e/audit.spec.ts</code> — écrans : M7 (1a, 1b), M1 (2), M10 (3)</summary>

```ts
import { expect, test, type Page, type Route } from "@playwright/test";

test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));
const PC = "http://127.0.0.1:4747", CODE = "ESSA-IPCM-UNIN";

function message(json: unknown) {
  return { id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
}
const RESUME = { region: "Épaule D", date_bilan: "18/09/2026", age: 52, coup_oeil: "Douleur antérieure d'épaule droite.", chiffres: [{ label: "EVA", valeur: "5/10" }], sections: [{ titre: "Examen", items: ["Jobe +"] }],
  a_verifier: ["Date du bilan lue 18/09/2026", "« RE2 » lu « 30° »"] };

async function iaSimulee(page: Page, delaiCorrection = 0) {
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model" } });
    const corps = req.postDataJSON();
    const texte = JSON.stringify(corps.messages);
    if (texte.includes("Reporte chaque correction")) { await new Promise(r => setTimeout(r, delaiCorrection)); return route.fulfill({ json: message({ ...RESUME, a_verifier: [] }) }); }
    return route.fulfill({ json: message(RESUME) });
  });
  await page.goto("/");
  await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.getByRole("button", { name: "Fermer" }).click();
}
async function pdf(page: Page) { const p = await page.context().newPage(); await p.setContent("<h1>Bilan</h1>"); const b = await p.pdf(); await p.close(); return b; }

test("AUDIT 1a : la correction en cours de saisie disparaît au retour sur l'appli", async ({ page }) => {
  await iaSimulee(page);
  await page.locator("#file").setInputFiles([{ name: "Fiche Bilan - Marie DUPONT.pdf", mimeType: "application/pdf", buffer: await pdf(page) }]);
  await expect(page.locator(".vitem")).toHaveCount(2, { timeout: 15_000 });
  const point = page.locator(".vitem").nth(1);
  await point.getByRole("button", { name: "Corriger" }).click();
  await point.getByLabel("Correction").fill("RE2 à 40°, pas 30");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));   // retour depuis une autre appli
  await page.waitForTimeout(500);
  const reste = await page.getByLabel("Correction").count();
  console.log("AUDIT 1a : champ de correction encore là après le retour sur l'appli ?", reste === 1);
  expect(reste).toBe(0);
});

test("AUDIT 1b : la correction en cours de saisie disparaît quand la correction précédente est reportée", async ({ page }) => {
  await iaSimulee(page, 2500);
  await page.locator("#file").setInputFiles([{ name: "Fiche Bilan - Marie DUPONT.pdf", mimeType: "application/pdf", buffer: await pdf(page) }]);
  await expect(page.locator(".vitem")).toHaveCount(2, { timeout: 15_000 });
  const p1 = page.locator(".vitem").first();
  await p1.getByRole("button", { name: "Corriger" }).click();
  await p1.getByLabel("Correction").fill("18/09/2025");
  await p1.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator(".vitem")).toHaveCount(1);
  const p2 = page.locator(".vitem").first();
  await p2.getByRole("button", { name: "Corriger" }).click();
  await p2.getByLabel("Correction").fill("RE2 à 40°");
  await page.waitForTimeout(4000);   // l'IA finit de reporter la 1re correction pendant la saisie
  const reste = await page.getByLabel("Correction").count();
  console.log("AUDIT 1b : champ de correction encore là après le report de la correction précédente ?", reste === 1);
  expect(reste).toBe(0);
});

test("AUDIT 2 : un enregistrement de séance en cours est perdu sans question si on touche « Ma journée »", async ({ page }) => {
  await page.goto("/");
  await page.locator("#q").fill("Paul Voix");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await page.locator("#etatbtn").click();
  await page.locator("#syncadresse").fill(PC);
  await page.locator("#synccode").fill(CODE);
  await page.getByRole("button", { name: "Relier au PC" }).click();
  await expect(page.locator(".toast")).toContainText("Relié au PC");
  await page.locator("#etatclose").click();
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.getByRole("button", { name: /Enregistrer ma séance/ }).click();
  await expect(page.locator("#svoix .voix")).toContainText("Enregistrement");
  await page.waitForTimeout(2000);   // il parle depuis 2 secondes (ou 2 minutes)
  await page.getByRole("button", { name: /Ma journée/ }).click();
  const question = await page.locator("dialog.confirm[open]").count();
  await page.locator("#list .item", { hasText: "Paul V." }).click();
  const seances = await page.locator(".seance").count();
  console.log("AUDIT 2 : question posée ?", question === 1, "| séances enregistrées :", seances, "| enregistrement visible :", await page.locator("#svoix .voix").count());
  expect(question).toBe(0);
  expect(seances).toBe(0);
});

test("AUDIT 3 : chaque ouverture du bilan complet laisse un lecteur PDF en mémoire", async ({ page }) => {
  await page.goto("/");
  await page.locator("#file").setInputFiles([{ name: "Fiche Bilan - Jean MARTIN.pdf", mimeType: "application/pdf", buffer: await pdf(page) }]);
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Voir le bilan complet" }).click();
    await expect(page.locator(".viewer canvas")).toHaveCount(1, { timeout: 15_000 });
    await page.locator("#vclose").click();
  }
  await page.waitForTimeout(1000);
  const lecteurs = page.workers().filter(w => /pdf\.worker/.test(w.url())).length;
  console.log("AUDIT 3 : lecteurs PDF encore actifs après 4 ouvertures fermées :", lecteurs);
  expect(lecteurs).toBe(4);
});
```

</details>

<details><summary><code>e2e/audit2.spec.ts</code> — écrans : M4 (4), M3 (5)</summary>

```ts
import { expect, test, type Page, type Route } from "@playwright/test";
test.beforeEach(({ page }) => page.addInitScript(() => localStorage.setItem("liste-patients", "ouverte")));
const iso = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const message = (json: unknown) => ({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(json) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const item = (page: Page, nom: string) => page.locator("#list .item", { hasText: nom });
async function cle(page: Page) {
  await page.locator("#etatbtn").click();
  await page.getByText("Secours : clé API").click();
  await page.getByLabel("Autoriser l'usage d'une clé API").check();
  await page.getByLabel("Utiliser la clé API").check();
  await page.locator("#iacle").fill("sk-ant-api03-cle-de-test-pour-les-essais-0000");
  await page.getByRole("button", { name: "Enregistrer la clé" }).click();
  await expect(page.getByRole("status")).toContainText("Clé vérifiée");
  await page.locator("#etatclose").click();
}

test("AUDIT 4 : « Annuler cette dictée » efface aussi un rendez-vous posé ensuite pour un autre patient", async ({ page }) => {
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model" } });
    const t = JSON.stringify(req.postDataJSON().messages);
    if (t.includes("dictée groupée")) return route.fulfill({ json: message({ seances: [{ nom: "Marc D.", extrait: "douleur 3 sur 10 renforcement", propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }] }) });
    if (t.includes("image")) return route.fulfill({ json: message({ region: "Épaule D", date_bilan: null, age: null, coup_oeil: "Bilan.", chiffres: [], sections: [], a_verifier: [] }) });
    return route.fulfill({ json: message({ propre: null, resume: null, bref: null, rdv_date: null, rdv_heure: null, rdv_demi: null }) });
  });
  await page.goto("/");
  for (const n of ["Marc DUPONT", "Lucie BERNARD"]) await page.locator("#file").setInputFiles([{ name: `Bilan - ${n}.png`, mimeType: "image/png", buffer: png }]);
  await expect(page.locator("#list .item")).toHaveCount(2);
  await cle(page);
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.locator("#dtexte").fill("avec Marc douleur 3 sur 10 renforcement");
  await page.getByRole("button", { name: "Ranger la dictée" }).click();
  await expect(page.locator(".recap")).toContainText("1 séance rangée : Marc D.");
  // ensuite, il pose un rendez-vous à Lucie (sans rapport avec la dictée)
  await item(page, "Lucie B.").click();
  await page.getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await page.locator("#rdate").fill(iso(3));
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.locator(".rdv")).toContainText("Prochain rendez-vous");
  // puis il annule la dictée (Marc mal compris)
  await page.getByRole("button", { name: "Dictée groupée" }).click();
  await page.getByRole("button", { name: "Annuler cette dictée" }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "Annuler la dictée" }).click();
  await expect(page.locator("#dtexte")).toBeVisible();
  await page.locator("#dfermer").click();
  await item(page, "Lucie B.").click();
  const rdv = await page.locator(".rdv").innerText();
  console.log("AUDIT 4 : rendez-vous de Lucie après l'annulation de la dictée :", rdv.replace(/\s+/g, " "));
  expect(rdv).toContain("Aucun rendez-vous prévu");
});

test("AUDIT 5 : une séance dont l'analyse a échoué n'est jamais reprise, son rendez-vous dicté n'est pas posé", async ({ page }) => {
  let echec = true, appels = 0;
  await page.route("https://api.anthropic.com/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: { id: "claude-opus-5-5", type: "model" } });
    appels++;
    if (echec) return route.abort("internetdisconnected");    // réseau coupé pendant l'analyse (appli en arrière-plan, Wi-Fi perdu)
    return route.fulfill({ json: message({ propre: "État du patient : douleur 2/10.\nÀ venir : renforcement, dans une semaine.", resume: "Renforcement.", bref: "Douleur 2/10.", rdv_date: iso(7), rdv_heure: null, rdv_demi: "matin" }) });
  });
  await page.goto("/");
  await page.locator("#q").fill("Paul Test");
  await page.getByRole("button", { name: /Créer le patient/ }).click();
  await cle(page);
  await page.getByRole("button", { name: "Dicter la séance" }).click();
  await page.locator("#stext").fill("douleur 2 sur 10 pour la prochaine séance renforcement dans une semaine le matin");
  await page.getByRole("button", { name: "Enregistrer la séance" }).click();
  await expect(page.locator(".seance")).toHaveCount(1);
  await page.waitForTimeout(3000);
  echec = false;                                              // le réseau revient
  await page.reload();                                        // l'appli est rouverte plus tard
  await page.waitForTimeout(4000);
  await item(page, "Paul T.").click();
  const rdv = await page.locator(".rdv").innerText(), texte = await page.locator(".seance .sc").first().innerText();
  console.log("AUDIT 5 : demandes à l'IA :", appels, "| séance :", texte.slice(0, 60), "| rendez-vous :", rdv.replace(/\s+/g, " "));
  expect(rdv).toContain("Aucun rendez-vous prévu");
  expect(texte).not.toContain("État du patient");
});
```

</details>

<details><summary><code>capture.mjs</code> — faux point d'accès de l'API pour observer ce qu'envoie le vrai Claude Code</summary>

```js
// Faux point d'accès de l'API : garde le corps de la première demande de Claude Code, puis répond par une erreur
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
let n = 0;
createServer((req, res) => {
  let b = ""; req.on("data", d => b += d); req.on("end", () => {
    if (req.url.includes("/v1/messages") && !req.url.includes("count_tokens")) { writeFileSync(process.argv[2] + "." + (n++) + ".json", b); }
    res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "capture" } }));
  });
}).listen(4997, "127.0.0.1");
```

</details>

Commande utilisée avec `capture.mjs` (depuis la racine du projet, environnement minimal comme sur Railway, clé factice pour forcer l'envoi vers le faux point d'accès) :

```sh
node capture.mjs ./demande &
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Bonjour"}]}}' | env -i PATH="$PATH" HOME=./home LANG=C.UTF-8 CLAUDE_CONFIG_DIR=./cfg ANTHROPIC_API_KEY=sk-ant-faux ANTHROPIC_BASE_URL=http://127.0.0.1:4997 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 node_modules/.bin/claude -p --input-format stream-json --output-format stream-json --verbose --model opus --effort low --system-prompt "Consigne de test" --json-schema '{"type":"object","properties":{"x":{"type":"string"}},"required":["x"]}' --tools "" --strict-mcp-config --mcp-config '{"mcpServers":{}}' --setting-sources "" --no-session-persistence
```
