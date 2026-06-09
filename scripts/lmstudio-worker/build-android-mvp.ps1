# Build APK MVP tabaco for field testing (Windows worker)
$ErrorActionPreference = "Stop"
$RepoRoot = "C:\dev\CenterMind"
$MobileDir = Join-Path $RepoRoot "shelfy-mobile"
$ApkPath = Join-Path $MobileDir "build\app\outputs\flutter-apk\app-tabaco-release.apk"

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
    Write-Error "flutter no está en PATH. Instalá Flutter y Android SDK, luego reabrí PowerShell."
}

Set-Location $MobileDir
Write-Host ">> flutter pub get"
flutter pub get
Write-Host ">> flutter build apk --flavor tabaco --release (API prod)"
flutter build apk --flavor tabaco --release --dart-define-from-file=config/prod-device.json

if (-not (Test-Path $ApkPath)) {
    Write-Error "APK no encontrado en: $ApkPath"
}

Write-Host ""
Write-Host "APK listo:" -ForegroundColor Green
Write-Host $ApkPath
Write-Host ""
Write-Host "Instalar en celular (USB debugging):"
Write-Host "  adb install -r `"$ApkPath`""
