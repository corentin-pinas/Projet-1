# Installation de Muninn sur le PC Windows (à lancer dans « Terminal (administrateur) »).
# 1. installe Node.js si besoin ; 2. range Muninn dans C:\ProgramData\Muninn (accès réservé à l'administrateur) ;
# 3. le fait démarrer avec Windows, même sans ouvrir de session ; 4. le rend joignable par Tailscale (HTTPS, vos appareils seulement) ;
# 5. affiche l'adresse et le code à taper sur la tablette et le téléphone.
# Relancer ce script met Muninn à jour sans toucher aux données.
$ErrorActionPreference = "Stop"
$Adresse = "__ADRESSE__"
$Dossier = Join-Path $env:ProgramData "Muninn"
$Port = 4747

function Etape($t) { Write-Host ""; Write-Host "== $t" -ForegroundColor Cyan }
function Stop-Erreur($t) { Write-Host ""; Write-Host $t -ForegroundColor Red; Write-Host "Envoyez une capture de cette fenêtre à Claude."; exit 1 }

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Stop-Erreur "Il faut ouvrir « Terminal (administrateur) » : clic droit sur le bouton Démarrer, puis « Terminal (administrateur) »." }

Etape "1/5 Node.js"
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

Etape "2/5 Muninn"
New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
# seuls le système, les administrateurs et vous pouvez lire ce dossier
icacls $Dossier /inheritance:r /grant:r "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "$($env:USERDOMAIN)\$($env:USERNAME):(OI)(CI)F" | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri "$Adresse/pc/muninn-pc.mjs" -OutFile (Join-Path $Dossier "muninn-pc.mjs")
Write-Host "Muninn rangé dans $Dossier"

Etape "3/5 Démarrage avec Windows"
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

Etape "4/5 Tailscale"
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (-not (Test-Path $ts)) { Stop-Erreur "Tailscale est introuvable. Installez-le depuis tailscale.com/download/windows puis relancez ce script." }
Write-Host "Si un lien s'affiche ci-dessous, ouvrez-le pour autoriser le partage HTTPS, validez, puis revenez ici."
& $ts serve --bg --https=443 "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) { Stop-Erreur "Tailscale n'a pas accepté le partage." }
$nom = ((& $ts status --json) | ConvertFrom-Json).Self.DNSName.TrimEnd(".")
$AdressePC = "https://$nom"

Etape "5/5 Vérification"
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
Write-Host " Sur chaque appareil : État de l'appli > Partage avec le PC,"
Write-Host " tapez l'adresse et le code, puis « Relier au PC »."
Write-Host "==========================================================" -ForegroundColor Green
