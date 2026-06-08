# Install Android SDK components for Flutter (headless, Windows)
$ErrorActionPreference = "Stop"

$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
$CmdlineRoot = Join-Path $SdkRoot "cmdline-tools"
$LatestDir = Join-Path $CmdlineRoot "latest"
$ZipPath = Join-Path $env:TEMP "commandlinetools-win.zip"
$Url = "https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip"

# JDK 17 for sdkmanager
$JdkCandidates = @(
    "C:\Program Files\Microsoft\jdk-17*",
    "C:\Program Files\Eclipse Adoptium\jdk-17*"
)
$JdkHome = Get-ChildItem $JdkCandidates -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $JdkHome) { throw "JDK 17 not found. Install Microsoft.OpenJDK.17 via winget." }
$env:JAVA_HOME = $JdkHome.FullName
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

Write-Host "JAVA_HOME=$env:JAVA_HOME"

New-Item -ItemType Directory -Force -Path $LatestDir | Out-Null

if (-not (Test-Path (Join-Path $LatestDir "bin\sdkmanager.bat"))) {
    Write-Host ">> Downloading Android command-line tools..."
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
    $ExtractTemp = Join-Path $env:TEMP "cmdline-tools-extract"
    if (Test-Path $ExtractTemp) { Remove-Item -Recurse -Force $ExtractTemp }
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractTemp -Force
    # Zip contains cmdline-tools/ subfolder
    $Inner = Join-Path $ExtractTemp "cmdline-tools"
    if (Test-Path $Inner) {
        Get-ChildItem $Inner | ForEach-Object { Copy-Item $_.FullName -Destination $LatestDir -Recurse -Force }
    } else {
        Get-ChildItem $ExtractTemp | ForEach-Object { Copy-Item $_.FullName -Destination $LatestDir -Recurse -Force }
    }
}

$sdkmanager = Join-Path $LatestDir "bin\sdkmanager.bat"
if (-not (Test-Path $sdkmanager)) { throw "sdkmanager not found at $sdkmanager" }

$packages = @(
    "platform-tools",
    "platforms;android-35",
    "build-tools;35.0.0",
    "emulator",
    "system-images;android-35;google_apis;x86_64"
)

Write-Host ">> Accepting SDK licenses..."
$yes = 1..50 | ForEach-Object { "y" }
$yes | & $sdkmanager --sdk_root=$SdkRoot --licenses | Out-Null

Write-Host ">> Installing SDK packages..."
& $sdkmanager --sdk_root=$SdkRoot @packages

# Persist env vars (user)
[Environment]::SetEnvironmentVariable("ANDROID_HOME", $SdkRoot, "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $SdkRoot, "User")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$additions = @(
    "$SdkRoot\platform-tools",
    "$SdkRoot\emulator",
    "$LatestDir\bin"
)
foreach ($p in $additions) {
    if ($userPath -notlike "*$p*") { $userPath = "$userPath;$p" }
}
[Environment]::SetEnvironmentVariable("Path", $userPath, "User")

# Create AVD for Flutter
$avdmanager = Join-Path $LatestDir "bin\avdmanager.bat"
$avdName = "shelfy_pixel_api35"
$avdList = & $avdmanager list avd 2>&1
if ($avdList -notmatch $avdName) {
    Write-Host ">> Creating emulator AVD: $avdName"
    echo "no" | & $avdmanager create avd -n $avdName -k "system-images;android-35;google_apis;x86_64" -d "pixel_6" --force
}

Write-Host ""
Write-Host "ANDROID_HOME=$SdkRoot" -ForegroundColor Green
Write-Host "AVD=$avdName" -ForegroundColor Green
Write-Host "Reopen PowerShell, then: flutter doctor --android-licenses"
