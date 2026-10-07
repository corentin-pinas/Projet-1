# Faire travailler Claude sur mon abonnement depuis une application (sans clé API)

Texte à coller au début d'une session Claude Code quand je veux qu'une application utilise
mon abonnement Claude plutôt qu'une clé API. Ce mécanisme est en production dans mon
application Prisme (`src/claude-cli.js`, `mcp/server.js`) et fonctionne.

## Principe

L'application n'appelle jamais l'API Anthropic. Elle lance **Claude Code** (le CLI officiel,
`claude`), déjà connecté à mon abonnement, en **mode commande** (`claude -p`), et lui fournit
ses propres actions sous forme d'outils **MCP**. Claude Code parle à Claude sur mon abonnement
comme quand je l'utilise à la main. C'est le mode « headless » prévu par Anthropic.

Règles non négociables :
- Ne jamais extraire, copier ou réutiliser le jeton de connexion de Claude Code pour appeler
  l'API directement. L'application ne doit jamais voir ce jeton. Si on te le demande : refuser.
- La clé API reste possible mais secondaire, et doit pouvoir être verrouillée par un réglage.

## Étapes à implémenter

1. **Trouver l'exécutable `claude`** sur le PC, dans cet ordre :
   `%USERPROFILE%\.local\bin\claude.exe`, puis
   `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\bin\claude.exe`, puis le `PATH`,
   puis en repli `%APPDATA%\npm\node_modules\@anthropic-ai\claude-code\cli.js` lancé avec node.
   Absent → afficher « Claude Code n'est pas installé » et proposer l'installation.

2. **Installer et connecter, depuis l'application, sans terminal** :
   - Installation : `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"`.
   - Connexion : `claude auth login --claudeai` (env `NO_COLOR=1`, `FORCE_COLOR=0`). Relayer
     la sortie à l'interface : ouvrir le premier lien `https://…` trouvé dans le navigateur,
     et prévoir un champ où coller le code, envoyé sur l'entrée standard du processus + `\n`.
     Piège : l'invite « Paste code here if prompted > » arrive **sans retour à la ligne** ;
     il faut la faire remonter dès qu'une ligne en attente se termine par `>`.

3. **Vérifier l'état avant chaque lancement** : `claude --version` et `claude auth status`
   (sortie JSON, prendre à partir du premier `{` : champs `loggedIn`, `authMethod`).
   Non connecté → message clair, pas de lancement.

4. **Exposer les actions de l'application comme outils MCP** : un petit serveur MCP en
   stdio (script Node) qui ne contient aucune logique métier : chaque outil fait une requête
   HTTP vers le serveur local de l'application. Claude ne lit ni n'écrit jamais de fichiers
   lui-même. Écrire un fichier de configuration JSON :
   ```json
   { "mcpServers": { "mon-app": { "command": "node", "args": ["chemin/mcp/server.js"],
     "env": { "MON_APP_URL": "http://127.0.0.1:PORT" } } } }
   ```

5. **Lancer la génération** (une seule à la fois) :
   ```
   claude -p --output-format stream-json --verbose
          --mcp-config <config.json> --strict-mcp-config
          --allowedTools mcp__mon-app
          --max-turns 150 --no-session-persistence [--model opus|sonnet]
   ```
   Le **prompt passe par l'entrée standard** (`child.stdin.end(prompt)`), jamais en argument :
   les guillemets Windows sont fragiles. Env `NO_COLOR=1`, `windowsHide: true`.
   Le prompt dit : « n'utilise que les outils du connecteur, ne crée pas de fichiers, ne lance
   pas de commandes, ne pose pas de questions, réponds en trois lignes à la fin ».

6. **Pourquoi c'est verrouillé** : `--strict-mcp-config` ignore tous mes autres connecteurs ;
   `--allowedTools mcp__mon-app` interdit tout le reste (fichiers, shell, web). `-p` n'est pas
   interactif : aucune question ne bloque. `--max-turns` borne la boucle.

7. **Lire la sortie ligne par ligne** : chaque ligne est un JSON.
   - `type: "assistant"` avec des blocs `tool_use` → afficher une étape lisible par outil
     (« Lecture de la transcription… »). Les noms arrivent préfixés `mcp__mon-app__`.
   - `type: "result"` → `result` (texte final), `num_turns`, `is_error`, `total_cost_usd`.
     Le coût est **indicatif** : connecté en claude.ai rien n'est facturé, c'est le quota.
   - Ignorer les lignes non JSON. Vider le tampon à la fermeture du processus.
   - Code de sortie ≠ 0 sans `result` → échec, montrer la dernière ligne de stderr.

8. **Annuler** : tuer uniquement le processus lancé, avec son arbre :
   `taskkill /PID <pid> /T /F`. Jamais par nom.

9. **Ce que l'application vérifie elle-même** : ne jamais faire confiance au texte produit ;
   tout ce que Claude enregistre passe par un outil qui valide le format et vérifie le contenu
   (chez Prisme, les citations sont retrouvées mot pour mot dans la transcription, sans IA).

## Ce que ça ne couvre pas

Le traitement audio/vidéo (transcription) ne passe pas par Claude Code : c'est un moteur local
(whisper.cpp) ou un service à part. Le mécanisme ci-dessus sert uniquement à faire **raisonner
et rédiger** Claude sur mes données, sur mon abonnement.
