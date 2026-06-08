# Preflight shelfy-mobile Android (Windows Error Hunter worker)
$ErrorActionPreference = "Continue"
$RepoRoot = "C:\dev\CenterMind"
$MobileDir = Join-Path $RepoRoot "shelfy-mobile"
$OutDir = Join-Path $RepoRoot "scripts\lmstudio-worker\output"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Set-Location $MobileDir

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$analyzeFile = Join-Path $OutDir "flutter-analyze-$stamp.txt"
$doctorFile = Join-Path $OutDir "flutter-doctor-$stamp.txt"

Write-Host ">> flutter doctor -v"
flutter doctor -v 2>&1 | Tee-Object -FilePath $doctorFile

Write-Host ">> flutter pub get"
flutter pub get

Write-Host ">> flutter analyze"
flutter analyze 2>&1 | Tee-Object -FilePath $analyzeFile

Write-Host ""
Write-Host "Salidas guardadas en:" -ForegroundColor Green
Write-Host "  $doctorFile"
Write-Host "  $analyzeFile"
Write-Host ""
Write-Host "Pegá el contenido de flutter-analyze en LM Studio (sección EVIDENCIA)."
