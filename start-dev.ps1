#Requires -Version 5.1
<#
.SYNOPSIS
    Startet die komplette lokale Dev-Umgebung für das KSV Sommercamp-System.
    Backend (uvicorn) · Frontend (Next.js) · Claude – jeweils in eigenem Terminal.
#>

$ErrorActionPreference = 'Stop'
$root         = $PSScriptRoot
$backendPath  = Join-Path $root 'backend'
$frontendPath = Join-Path $root 'frontend'
$activate     = Join-Path $backendPath '.venv\Scripts\Activate.ps1'

# ── Voraussetzungen prüfen ────────────────────────────────────────────────────

if (-not (Test-Path $activate)) {
    Write-Host ''
    Write-Host '  [!] Python-Venv nicht gefunden.' -ForegroundColor Red
    Write-Host "      Erwartet: $activate" -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Einmalig im backend-Ordner ausführen:' -ForegroundColor Cyan
    Write-Host '    python -m venv .venv' -ForegroundColor White
    Write-Host '    .\.venv\Scripts\pip install -r requirements.txt' -ForegroundColor White
    Write-Host ''
    Read-Host '  Drücke Enter zum Beenden'
    exit 1
}

if (-not (Test-Path (Join-Path $frontendPath 'node_modules'))) {
    Write-Host ''
    Write-Host '  [!] node_modules nicht gefunden.' -ForegroundColor Red
    Write-Host '      Einmalig im frontend-Ordner ausführen: npm install' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '  Drücke Enter zum Beenden'
    exit 1
}

# ── Hilfsfunktion: Terminal öffnen ───────────────────────────────────────────
# Verwendet -EncodedCommand, um Pfade mit Sonderzeichen sicher zu übergeben.

function Start-DevTerminal {
    param(
        [string]$Title,
        [string]$Command
    )
    $fullCmd = "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    $encoded = [Convert]::ToBase64String(
        [System.Text.Encoding]::Unicode.GetBytes($fullCmd)
    )
    Start-Process powershell -ArgumentList '-NoExit', '-EncodedCommand', $encoded
}

# ── Terminals starten ─────────────────────────────────────────────────────────

Write-Host ''
Write-Host '  KSV Sommercamp – Dev-Umgebung wird gestartet ...' -ForegroundColor Cyan
Write-Host ''

Write-Host '  [1/3] Backend  (uvicorn --reload)' -ForegroundColor Green
Start-DevTerminal `
    -Title   'Backend – uvicorn' `
    -Command "Set-Location '$backendPath'; & '$activate'; uvicorn main:app --reload"

Start-Sleep -Milliseconds 400

Write-Host '  [2/3] Frontend (npm run dev)' -ForegroundColor Green
Start-DevTerminal `
    -Title   'Frontend – Next.js' `
    -Command "Set-Location '$frontendPath'; npm run dev"

Start-Sleep -Milliseconds 400

Write-Host '  [3/3] Claude' -ForegroundColor Green
Start-DevTerminal `
    -Title   'Claude' `
    -Command "Set-Location '$root'; claude"

# ── Browser öffnen ────────────────────────────────────────────────────────────
# Kurze Wartezeit, damit Backend und Frontend hochfahren können.

Write-Host ''
Write-Host '  Browser öffnet sich in 5 Sekunden ...' -ForegroundColor DarkCyan
Start-Sleep -Seconds 5

Start-Process 'http://localhost:3000'
Start-Sleep -Milliseconds 400
Start-Process 'http://127.0.0.1:8000/docs'

Write-Host ''
Write-Host '  Fertig. Alle Prozesse laufen in eigenen Terminals.' -ForegroundColor Green
Write-Host ''
Write-Host '    Frontend:  http://localhost:3000' -ForegroundColor White
Write-Host '    API-Docs:  http://127.0.0.1:8000/docs' -ForegroundColor White
Write-Host '    Admin:     http://localhost:3000/admin' -ForegroundColor White
Write-Host ''
