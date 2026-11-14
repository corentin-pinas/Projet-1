# Installation de Muninn sur le PC Windows (à lancer dans « Terminal (administrateur) »).
# 1. installe Node.js si besoin ; 2. range Muninn dans C:\ProgramData\Muninn (accès réservé à l'administrateur) ;
# 3. le fait démarrer avec Windows, même sans ouvrir de session ; 4. le rend joignable par Tailscale (HTTPS, vos appareils seulement) ;
# 5. installe Whisper (transcription de la voix sur le PC, la voix ne sort pas de chez vous) ;
# 6. affiche l'adresse et le code à taper sur la tablette et le téléphone.
# Relancer ce script met Muninn à jour sans toucher aux données. Depuis la 1.7.0, Muninn se met ensuite à jour tout seul
# (lanceur.mjs) ; il ne faut relancer ce script que quand « État de l'appli » le demande.
$ErrorActionPreference = "Stop"
$Adresse = "__ADRESSE__"
$Dossier = Join-Path $env:ProgramData "Muninn"
$Port = 4747
$Installeur = 3   # à augmenter quand une mise à jour demande de relancer cette installation (droits, Python, lanceur)

function Etape($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Stop-Erreur($t) { Write-Host ""; Write-Host $t -ForegroundColor Red; Write-Host "Envoyez une capture de cette fenêtre à Claude."; exit 1 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Stop-Erreur "Il faut ouvrir « Terminal (administrateur) » : clic droit sur le bouton Démarrer, puis « Terminal (administrateur) »." }

Etape "1/6 Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
$ok = $false
if ($node) { $v = (& $node.Source --version) -replace "^v", ""; $ok = [int]($v.Split(".")[0]) -ge 22 }
if (-not $ok) {
  Write-Host "Installation de Node.js (quelques minutes)..."
  winget install -e --id OpenJS.NodeJS.LTS --scope machine --accept-source-agreements --accept-package-agreements --silent
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { Stop-Erreur "Node.js ne s'est pas installé." }
}
$NodeExe = $node.Source
Write-Host "Node.js : $(& $NodeExe --version)"

Etape "2/6 Muninn"
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
# seuls le système, les administrateurs, vous et le compte de service de Muninn (« Service local », droits limités
# à ce dossier) peuvent lire ce dossier ; tout ce qu'il contient reprend ces droits
icacls $Dossier /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" "*S-1-5-19:(OI)(CI)M" | Out-Null
icacls (Join-Path $Dossier "*") /reset /T /C /Q | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/muninn-pc.mjs" -OutFile (Join-Path $Dossier "muninn-pc.mjs")
# le travail en tâche de fond (1.9.0) : le PC transcrit et range les dictées envoyées par les appareils
Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/travail.mjs" -OutFile (Join-Path $Dossier "travail.mjs")
# le lanceur fait tourner le partage et Whisper, et les met à jour tout seul depuis cette adresse (maj.json)
Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/lanceur.mjs" -OutFile (Join-Path $Dossier "lanceur.mjs")
[IO.File]::WriteAllText((Join-Path $Dossier "maj.json"), (@{ adresse = $Adresse; installeur = $Installeur } | ConvertTo-Json))
Write-Host "Muninn rangé dans $Dossier"

Etape "3/6 Démarrage avec Windows"
$tache = "Muninn"
Stop-ScheduledTask -TaskName $tache -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $tache -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$(Join-Path $Dossier 'lanceur.mjs')`"" -WorkingDirectory $Dossier
# avant la 1.7.0, Whisper avait sa propre tâche : c'est maintenant le lanceur qui le fait tourner
Stop-ScheduledTask -TaskName "Muninn voix" -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "Muninn voix" -Confirm:$false -ErrorAction SilentlyContinue
$declencheur = New-ScheduledTaskTrigger -AtStartup
# compte « Service local » : droits limités (dossier de Muninn seulement), une faille ne donnerait pas la main sur le PC.
# S'il ne démarre pas avec lui, retour au compte système (comme avant) pour que Muninn marche quand même.
$limite = New-ScheduledTaskPrincipal -UserId "S-1-5-19" -LogonType ServiceAccount -RunLevel Limited
$systeme = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -LogonType ServiceAccount -RunLevel Highest
$reglages = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
# programmes de Muninn restés en marche (ancienne tâche arrêtée) : ils garderaient les ports 4747 et 4748
function Arreter-Restes {
  Get-CimInstance Win32_Process | Where-Object { $_.Name -in @("node.exe", "python.exe") -and $_.CommandLine -like "*$Dossier*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
function Lancer-Tache($nom, $act, $principal, $url) {
  Stop-ScheduledTask -TaskName $nom -ErrorAction SilentlyContinue
  Arreter-Restes
  Unregister-ScheduledTask -TaskName $nom -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $nom -Action $act -Trigger $declencheur -Principal $principal -Settings $reglages | Out-Null
  Start-ScheduledTask -TaskName $nom
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null; return $true } catch {}
  }
  return $false
}
$compteMuninn = "Service local (droits limités)"
$principalMuninn = $limite
$pret = Lancer-Tache $tache $action $limite "http://127.0.0.1:$Port/"
if (-not $pret) {
  Write-Host "Muninn ne démarre pas avec des droits limités : retour au compte système, comme avant." -ForegroundColor Yellow
  $compteMuninn = "système (comme avant)"
  $principalMuninn = $systeme
  $pret = Lancer-Tache $tache $action $systeme "http://127.0.0.1:$Port/"
}
if (-not $pret) { Stop-Erreur "Muninn ne répond pas sur le PC." }
Write-Host "Muninn est en marche (compte $compteMuninn) et redémarrera avec Windows."
# PC branché sur secteur : jamais en veille, sinon les appareils ne le joignent plus (choix de Corentin du 11 novembre 2026).
# L'écran peut s'éteindre ; sur batterie, le réglage de Windows ne change pas.
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
Write-Host "Le PC ne se mettra plus en veille quand il est branché (l'écran peut s'éteindre)."

Etape "4/6 Tailscale"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) { Stop-Erreur "Tailscale est introuvable. Installez-le depuis tailscale.com/download/windows puis relancez ce script." }
Write-Host "Si un lien s'affiche ci-dessous, ouvrez-le pour autoriser le partage HTTPS, validez, puis revenez ici."
& $ts serve --bg --https=443 "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) { Stop-Erreur "Tailscale n'a pas accepté le partage." }
$nom = ((& $ts status --json) | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
$AdressePC = "https://$nom"

Etape "5/6 Whisper (dictée à la voix)"
# la voix est transcrite sur le PC lui-même : Python + faster-whisper, modèle « large-v3-turbo » (environ 1,6 Go, téléchargé au premier démarrage)
$py = "C:\Program Files\Python312\python.exe"
if (-not (Test-Path $py)) {
  Write-Host "Installation de Python (quelques minutes)..."
  winget install -e --id Python.Python.3.12 --scope machine --accept-source-agreements --accept-package-agreements --silent
}
$voixOk = $false
if (-not (Test-Path $py)) { Write-Host "Python ne s'est pas installé : la dictée à la voix ne sera pas disponible. Le reste de Muninn marche." -ForegroundColor Yellow }
else {
  $env_ = Join-Path $Dossier "voix-env"
  if (-not (Test-Path (Join-Path $env_ "Scripts\python.exe"))) { & $py -m venv $env_ }
  $pyVoix = Join-Path $env_ "Scripts\python.exe"
  Write-Host "Installation de Whisper (quelques minutes)..."
  # av (lecture du son) figé : à partir de la version 19, faster-whisper 1.2.1 ne sait plus ouvrir un enregistrement.
  # Toutes les autres bibliothèques sont figées aux versions de la dernière installation qui a marché (voix-versions.txt) :
  # une réinstallation ne tire pas une nouvelle version qui casserait la voix (même panne qu'av 19).
  $versions = Join-Path $Dossier "voix-versions.txt"
  $paquets = @("faster-whisper==1.2.1", "av==18.1.0")
  if (Test-Path $versions) {
    & $pyVoix -m pip install --quiet --disable-pip-version-check --upgrade -c $versions @paquets
    if ($LASTEXITCODE -ne 0) {
      Write-Host "Versions gardées incompatibles avec cette mise à jour : installation des versions du moment." -ForegroundColor Yellow
      & $pyVoix -m pip install --quiet --disable-pip-version-check --upgrade @paquets
    }
  } else { & $pyVoix -m pip install --quiet --disable-pip-version-check --upgrade @paquets }
  # carte graphique NVIDIA : Whisper va bien plus vite avec elle ; sinon le processeur suffit
  $nvidia = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" }).Count -gt 0
  if ($nvidia) { & $pyVoix -m pip install --quiet --disable-pip-version-check "nvidia-cublas-cu12" "nvidia-cudnn-cu12==9.*" }
  $coeurs = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
  $memoire = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
  $modele = if ($nvidia -or ($coeurs -ge 4 -and $memoire -ge 6)) { "large-v3-turbo" } else { "small" }
  [IO.File]::WriteAllText((Join-Path $Dossier "voix.json"), (@{ modele = $modele; gpu = $nvidia } | ConvertTo-Json))
  Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/voix.py" -OutFile (Join-Path $Dossier "voix.py")
  icacls (Join-Path $Dossier "*") /reset /T /C /Q | Out-Null
  # le lanceur, redémarré, voit maintenant voix.py et le fait tourner avec le partage
  $compteVoix = $compteMuninn
  $voixOk = Lancer-Tache $tache $action $principalMuninn "http://127.0.0.1:4748/etat"
  if ($voixOk) {
    # Whisper répond, mais doit aussi pouvoir charger son modèle avec ces droits : jusqu'à 2 minutes d'attente
    # (une erreur sans modèle prêt = droits insuffisants ; ni l'un ni l'autre = premier téléchargement en cours)
    $e = $null
    for ($i = 0; $i -lt 120; $i++) {
      try { $e = Invoke-RestMethod -Uri "http://127.0.0.1:4748/etat" -TimeoutSec 2 } catch {}
      if ($e -and $e.pret) { break }
      Start-Sleep -Seconds 1
    }
    if ($e -and -not $e.pret -and $e.erreur) { $voixOk = $false }
  }
  if (-not $voixOk -and $principalMuninn -eq $limite) {
    Write-Host "Whisper ne démarre pas avec des droits limités : retour au compte système, comme avant." -ForegroundColor Yellow
    $compteVoix = "système (comme avant)"
    $compteMuninn = "système (comme avant)"
    $voixOk = Lancer-Tache $tache $action $systeme "http://127.0.0.1:4748/etat"
  }
  if ($voixOk) {
    # la voix marche : ses versions sont gardées pour la prochaine installation
    (& $pyVoix -m pip freeze --disable-pip-version-check) | Set-Content -Encoding ascii -Path $versions
  }
  $materiel = if ($nvidia) { "carte graphique NVIDIA" } else { "processeur ($coeurs cœurs, $memoire Go)" }
  if ($voixOk) { Write-Host "Whisper en marche (compte $compteVoix) : modèle $modele sur le $materiel. Premier démarrage : téléchargement du modèle, prêt dans 5 à 15 minutes." -ForegroundColor Green }
  else { Write-Host "Whisper ne répond pas encore. La dictée à la voix sera indisponible ; le reste de Muninn marche." -ForegroundColor Yellow }
}

Etape "6/6 Vérification"
try { Invoke-WebRequest -UseBasicParsing -Uri "$AdressePC/" -TimeoutSec 60 | Out-Null; Write-Host "Joignable par Tailscale." -ForegroundColor Green }
catch { Write-Host "Pas encore joignable par Tailscale (le certificat HTTPS peut prendre une minute). Continuez quand même." -ForegroundColor Yellow }

$Code = (Get-Content (Join-Path $Dossier "code.txt")).Trim()
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Muninn est installé sur ce PC." -ForegroundColor Green
Write-Host " Il se met désormais à jour tout seul (au démarrage puis toutes les 6 heures)." -ForegroundColor Green
Write-Host " Il range aussi vos dictées en tâche de fond : vous pouvez fermer Muninn après avoir dicté." -ForegroundColor Green
Write-Host " Ne relancez cette ligne que si « État de l'appli » vous le demande." -ForegroundColor Green
Write-Host ""
Write-Host " Adresse du PC : $AdressePC" -ForegroundColor Yellow
Write-Host " Code du PC    : $Code" -ForegroundColor Yellow
Write-Host ""
if ($voixOk) { Write-Host " Dictée à la voix : bouton « Enregistrer ma dictée » dans la dictée groupée," ; Write-Host " dès que Whisper a fini de télécharger son modèle." ; Write-Host "" }
Write-Host " Sur chaque appareil : État de l'appli > Partage avec le PC,"
Write-Host " tapez l'adresse et le code, puis « Relier au PC »."
Write-Host "==========================================================" -ForegroundColor Green
