# testandroid.ps1 — SHELFYAPP Android en Windows
# Uso:
#   .\scripts\testandroid.ps1 prod          # emulador o device → API prod (default)
#   .\scripts\testandroid.ps1 local         # emulador → API local Windows :8000
#   .\scripts\testandroid.ps1 build         # APK release tabaco (prod API)
#   .\scripts\testandroid.ps1 emulator      # lanza AVD shelfy_pixel_api35
param(
    [ValidateSet("prod", "local", "build", "emulator", "devices")]
    [string]$Mode = "prod"
)

$ErrorActionPreference = "Stop"
$Mobile = Split-Path $PSScriptRoot -Parent
$Root = Split-Path $Mobile -Parent
$Backend = Join-Path $Root "CenterMind"
$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$Jdk = "C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot"

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $SdkRoot
$env:Path = "$Jdk\bin;C:\dev\flutter\bin;$SdkRoot\platform-tools;$SdkRoot\emulator;" + $env:Path

function Sync-Assets {
    $assetsDir = Join-Path $Mobile "assets\config"
    New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
    Copy-Item (Join-Path $Mobile "config\prod-device.json") (Join-Path $assetsDir "prod-device.json") -Force
    Copy-Item (Join-Path $Mobile "config\dev-simulator.json") (Join-Path $assetsDir "dev-simulator.json") -Force
    if (Test-Path (Join-Path $Mobile "config\dev-device.json")) {
        Copy-Item (Join-Path $Mobile "config\dev-device.json") (Join-Path $assetsDir "dev-device.json") -Force
    } else {
        Copy-Item (Join-Path $Mobile "config\prod-device.json") (Join-Path $assetsDir "dev-device.json") -Force
    }
}

function Get-LanIp {
    $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -First 1 -ExpandProperty IPAddress
    if (-not $ip) { $ip = "127.0.0.1" }
    return $ip
}

function Refresh-LocalDeviceConfig {
    $lan = Get-LanIp
    $json = @{
        API_SCHEME = "http"
        API_HOST   = $lan
        API_PORT   = "8000"
        FLAVOR     = "tabaco"
    } | ConvertTo-Json
    $path = Join-Path $Mobile "config\dev-device.json"
    Set-Content -Path $path -Value $json -Encoding utf8
    Write-Host "[testandroid] dev-device.json -> http://${lan}:8000"
}

function Start-LocalApi {
    if (Test-Path (Join-Path $Backend ".env")) {
        $health = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($health.StatusCode -eq 200) {
            Write-Host "[testandroid] API ya online en :8000"
            return
        }
        Write-Host "[testandroid] Levantando API local..."
        $venvPython = Join-Path $Backend ".venv\Scripts\python.exe"
        if (-not (Test-Path $venvPython)) { throw "Falta CenterMind/.venv — corré bootstrap Python primero" }
        Start-Process -FilePath $venvPython -ArgumentList "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $Backend -WindowStyle Hidden
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            try {
                $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 2
                if ($r.StatusCode -eq 200) { Write-Host "[testandroid] API OK"; return }
            } catch {}
        }
        throw "API no respondió en :8000 — revisá CenterMind/.env"
    }
    Write-Host "[testandroid] WARN: sin CenterMind/.env — modo prod (Railway) aunque pediste local"
}

Set-Location $Mobile
Sync-Assets
flutter pub get | Out-Null

switch ($Mode) {
    "devices" {
        flutter devices
        adb devices
    }
    "emulator" {
        Write-Host "[testandroid] Lanzando emulador shelfy_pixel_api35..."
        flutter emulators --launch shelfy_pixel_api35
    }
    "build" {
        Write-Host "[testandroid] Build APK tabaco release (API prod)..."
        flutter build apk --flavor tabaco --release --dart-define-from-file=config/prod-device.json
        $apk = Join-Path $Mobile "build\app\outputs\flutter-apk\app-tabaco-release.apk"
        Write-Host "[testandroid] APK: $apk" -ForegroundColor Green
    }
    "local" {
        Refresh-LocalDeviceConfig
        Sync-Assets
        Start-LocalApi
        Write-Host "[testandroid] Run emulador → API local 10.0.2.2:8000"
        flutter emulators --launch shelfy_pixel_api35
        Start-Sleep -Seconds 15
        flutter run --flavor tabaco --dart-define-from-file=config/dev-emulator.json
    }
    default {
        Write-Host "[testandroid] Run → API prod (Railway)"
        $devices = flutter devices --machine 2>$null | ConvertFrom-Json
        $android = $devices | Where-Object { $_.targetPlatform -eq "android" } | Select-Object -First 1
        if (-not $android) {
            Write-Host "[testandroid] Sin device Android — lanzando emulador..."
            flutter emulators --launch shelfy_pixel_api35
            Start-Sleep -Seconds 20
        }
        flutter run --flavor tabaco --release --dart-define-from-file=config/prod-device.json
    }
}
