# Android dev rapido — Windows
# APK ya compilado: shelfy-mobile/build/app/outputs/flutter-apk/app-tabaco-release.apk

$Repo = "C:\dev\CenterMind"
$Apk = Join-Path $Repo "shelfy-mobile\build\app\outputs\flutter-apk\app-tabaco-release.apk"
$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$Jdk = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"
$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $SdkRoot
$env:Path = "$Jdk\bin;C:\dev\flutter\bin;$SdkRoot\platform-tools;$SdkRoot\emulator;" + $env:Path

Write-Host "=== SHELFY Android Dev (Windows) ===" -ForegroundColor Cyan
Write-Host "APK: $Apk"
Write-Host "  Existe: $(Test-Path $Apk)"
if (Test-Path $Apk) {
    $mb = [math]::Round((Get-Item $Apk).Length / 1MB, 1)
    Write-Host "  Tamano: ${mb} MB"
}
Write-Host ""
Write-Host "Comandos utiles:"
Write-Host "  Instalar en celular:  adb install -r `"$Apk`""
Write-Host "  Emulador:             cd shelfy-mobile; .\scripts\testandroid.ps1 emulator"
Write-Host "  Run prod API:         cd shelfy-mobile; .\scripts\testandroid.ps1 prod"
Write-Host "  Rebuild APK:          cd $Repo; .\scripts\lmstudio-worker\build-android-mvp.ps1"
Write-Host "  Analisis Gemma:       cd $Repo; .\scripts\lmstudio-worker\invoke-local.ps1 -Task '...' -ContextFile C:\temp\logcat.txt -EnsureServer"
Write-Host ""
