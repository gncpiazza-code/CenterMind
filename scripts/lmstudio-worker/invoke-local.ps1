# invoke-local.ps1 — delega análisis a LM Studio (Gemma local, sin Composer)
param(
    [Parameter(Mandatory = $true)]
    [string]$Task,
    [string]$ContextFile = "",
    [string]$Model = "",
    [switch]$EnsureServer
)

$ErrorActionPreference = "Stop"
$RepoRoot = "C:\dev\CenterMind"
Set-Location $RepoRoot

$configPath = Join-Path $PSScriptRoot "router-config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$apiUrl = $config.lmStudioUrl
$model = if ($Model) { $Model } else { $config.model }

$outDir = Join-Path $RepoRoot $config.outputDir
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if ($EnsureServer) {
    $probe = try { Invoke-RestMethod -Uri "http://127.0.0.1:1234/v1/models" -TimeoutSec 3 } catch { $null }
    if (-not $probe) {
        Write-Host ">> Iniciando LM Studio server..."
        lms server start --bind 127.0.0.1 --port 1234 | Out-Null
        Start-Sleep -Seconds 2
    }
}

$contextBlock = ""
if ($ContextFile -and (Test-Path $ContextFile)) {
    $raw = Get-Content $ContextFile -Raw -Encoding UTF8
    if ($raw.Length -gt 120000) { $raw = $raw.Substring($raw.Length - 120000) }
    $contextBlock = @"

## EVIDENCIA ADJUNTA
```
$raw
```
"@
}

$systemPrompt = @"
Sos Shelfy Error Hunter en modo ANÁLISIS ONLY (Windows, 16GB RAM).
Repo: C:\dev\CenterMind, app: shelfy-mobile (Flutter Android flavor tabaco).
PROHIBIDO: decir que aplicaste fixes, commits o tests sin evidencia.
Entregá informe markdown: Resumen, Errores CONFIRMADOS, SOSPECHOSOS, P0/P1, checklist APK ruta, handoff Mac.
"@

$userPrompt = @"
# TAREA
$Task
$contextBlock
"@

$body = @{
    model = $model
    messages = @(
        @{ role = "system"; content = $systemPrompt },
        @{ role = "user"; content = $userPrompt }
    )
    temperature = 0.2
    max_tokens = 4096
} | ConvertTo-Json -Depth 6

Write-Host ">> Delegando a Gemma local ($model)..."
try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 600
} catch {
    if ($model -ne $config.fallbackModel) {
        Write-Host ">> Reintentando con $($config.fallbackModel)..."
        $bodyObj = $body | ConvertFrom-Json
        $bodyObj.model = $config.fallbackModel
        $body = $bodyObj | ConvertTo-Json -Depth 6
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json; charset=utf-8" -TimeoutSec 600
    } else { throw }
}

$content = $response.choices[0].message.content
$id = "win-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$outFile = Join-Path $outDir "$id.md"

$header = @(
    "# Informe LM Studio - $id"
    ""
    "**Modelo:** $model"
    "**Tarea:** $Task"
)
if ($ContextFile) { $header += "**Contexto:** $ContextFile" }
$header += ""
$header += "---"
$header += ""
($header + $content) | Set-Content -Path $outFile -Encoding UTF8

Write-Host ""
Write-Host "Informe guardado:" -ForegroundColor Green
Write-Host $outFile
Write-Host ""
Write-Host "Siguiente: leer P0 del informe. Fixes de codigo -> Composer solo si el usuario lo pide."
