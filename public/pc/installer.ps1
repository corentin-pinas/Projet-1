# Installation de Muninn sur le PC Windows (à lancer dans « Terminal (administrateur) »).
# 1. installe Node.js si besoin ; 2. range Muninn dans C:\ProgramData\Muninn (accès réservé à l'administrateur) ;
# 3. le fait démarrer avec Windows, même sans ouvrir de session ; 4. le rend joignable par Tailscale (HTTPS, vos appareils seulement) ;
# 5. installe Whisper (transcription de la voix sur le PC, la voix ne sort pas de chez vous) ;
# 6. affiche l'adresse et le code à taper sur la tablette et le téléphone.
# Relancer ce script met Muninn à jour sans toucher aux données.
$ErrorActionPreference = "Stop"
$Adresse = "__ADRESSE__"
$Dossier = Join-Path $env:ProgramData "Muninn"
$Port = 4747

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
# seuls le système, les administrateurs et vous pouvez lire ce dossier
icacls $Dossier /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/muninn-pc.mjs" -OutFile (Join-Path $Dossier "muninn-pc.mjs")
Write-Host "Muninn rangé dans $Dossier"

Etape "3/6 Démarrage avec Windows"
$tache = "Muninn"
Stop-ScheduledTask -TaskName $tache -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $tache -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$(Join-Path $Dossier 'muninn-pc.mjs')`"" -WorkingDirectory $Dossier
$declencheur = New-ScheduledTaskTrigger -AtStartup
$compte = New-ScheduledTaskPrincipal -UserId "S-1-5-18" -LogonType ServiceAccount -RunLevel Highest
$reglages = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $tache -Action $action -Trigger $declencheur -Principal $compte -Settings $reglages | Out-Null
Start-ScheduledTask -TaskName $tache
$pret = $false
for ($i = 0; $i -lt 30 -and -not $pret; $i++) {
  Start-Sleep -Seconds 1
  try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2 | Out-Null; $pret = $true } catch {}
}
if (-not $pret) { Stop-Erreur "Muninn ne répond pas sur le PC." }
Write-Host "Muninn est en marche et redémarrera avec Windows."

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
  & $pyVoix -m pip install --quiet --disable-pip-version-check --upgrade "faster-whisper==1.2.1"
  # carte graphique NVIDIA : Whisper va bien plus vite avec elle ; sinon le processeur suffit
  $nvidia = @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" }).Count -gt 0
  if ($nvidia) { & $pyVoix -m pip install --quiet --disable-pip-version-check "nvidia-cublas-cu12" "nvidia-cudnn-cu12==9.*" }
  $coeurs = (Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfCores -Sum).Sum
  $memoire = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
  $modele = if ($nvidia -or ($coeurs -ge 4 -and $memoire -ge 6)) { "large-v3-turbo" } else { "small" }
  [IO.File]::WriteAllText((Join-Path $Dossier "voix.json"), (@{ modele = $modele; gpu = $nvidia } | ConvertTo-Json))
  Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/voix.py" -OutFile (Join-Path $Dossier "voix.py")
  $tacheVoix = "Muninn voix"
  Stop-ScheduledTask -TaskName $tacheVoix -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $tacheVoix -Confirm:$false -ErrorAction SilentlyContinue
  $actionVoix = New-ScheduledTaskAction -Execute $pyVoix -Argument "`"$(Join-Path $Dossier 'voix.py')`"" -WorkingDirectory $Dossier
  Register-ScheduledTask -TaskName $tacheVoix -Action $actionVoix -Trigger $declencheur -Principal $compte -Settings $reglages | Out-Null
  Start-ScheduledTask -TaskName $tacheVoix
  for ($i = 0; $i -lt 30 -and -not $voixOk; $i++) {
    Start-Sleep -Seconds 1
    try { Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4748/etat" -TimeoutSec 2 | Out-Null; $voixOk = $true } catch {}
  }
  $materiel = if ($nvidia) { "carte graphique NVIDIA" } else { "processeur ($coeurs cœurs, $memoire Go)" }
  if ($voixOk) { Write-Host "Whisper en marche : modèle $modele sur le $materiel. Premier démarrage : téléchargement du modèle, prêt dans 5 à 15 minutes." -ForegroundColor Green }
  else { Write-Host "Whisper ne répond pas encore. La dictée à la voix sera indisponible ; le reste de Muninn marche." -ForegroundColor Yellow }
}

Etape "6/6 Vérification"
try { Invoke-WebRequest -UseBasicParsing -Uri "$AdressePC/" -TimeoutSec 60 | Out-Null; Write-Host "Joignable par Tailscale." -ForegroundColor Green }
catch { Write-Host "Pas encore joignable par Tailscale (le certificat HTTPS peut prendre une minute). Continuez quand même." -ForegroundColor Yellow }

$Code = (Get-Content (Join-Path $Dossier "code.txt")).Trim()
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Muninn est installé sur ce PC." -ForegroundColor Green
Write-Host ""
Write-Host " Adresse du PC : $AdressePC" -ForegroundColor Yellow
Write-Host " Code du PC    : $Code" -ForegroundColor Yellow
Write-Host ""
if ($voixOk) { Write-Host " Dictée à la voix : bouton « Enregistrer ma dictée » dans la dictée groupée," ; Write-Host " dès que Whisper a fini de télécharger son modèle." ; Write-Host "" }
Write-Host " Sur chaque appareil : État de l'appli > Partage avec le PC,"
Write-Host " tapez l'adresse et le code, puis « Relier au PC »."
Write-Host "==========================================================" -ForegroundColor Green
