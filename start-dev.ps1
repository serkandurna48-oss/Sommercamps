#Requires -Version 5.1
[CmdletBinding()]
param([string]$DatabaseUrl = $env:DATABASE_URL,
      [string]$ApiUrl = $env:NEXT_PUBLIC_SAAS_API_URL,
      [switch]$DryRun)
$ErrorActionPreference = 'Stop'
try {
    . "$PSScriptRoot/scripts/dev/target.ps1"
    if (-not $DatabaseUrl) { $DatabaseUrl = 'postgresql://postgres@127.0.0.1:55443/dev_l2' }
    if (-not $ApiUrl) { $ApiUrl = $env:NEXT_PUBLIC_API_URL }
    if (-not $ApiUrl) { $ApiUrl = 'http://127.0.0.1:8112' }
    $target = Get-DevTarget $DatabaseUrl $ApiUrl
    Write-Host "`n============================================================" -ForegroundColor Yellow
    Write-Host "  $($target.Name) | DB-HOST: $($target.Db.Host) | API-HOST: $($target.Api.Host)" -ForegroundColor Yellow
    Write-Host "============================================================`n" -ForegroundColor Yellow
    if ($target.Name -eq 'PROD') {
        if ($env:ALLOW_PROD_WRITES -cne 'yes') { Write-Host 'PROD gesperrt: ALLOW_PROD_WRITES=yes erforderlich.'; exit 2 }
        if ([Console]::IsInputRedirected -or -not [Environment]::UserInteractive) { Write-Host 'PROD gesperrt: interaktive Bestaetigung erforderlich.'; exit 2 }
        try { $answer = Read-Host 'Zum Bestaetigen exakt PROD eingeben' } catch { exit 2 }
        if ($answer -cne 'PROD') { Write-Host 'PROD gesperrt: Bestaetigung fehlt.'; exit 2 }
    }
    if ($target.Name -eq 'STAGING') { Write-Warning 'STAGING: externes Ziel; keine lokalen Demo-Daten dorthin schreiben.' }
    Write-Host 'PLAN (lokaler Stack): PostgreSQL lokal starten; dev_l2 anlegen; alle Migrationen anwenden; JK-Demo-Org laden; Backend :8112 und Frontend :3112 starten.'
    if ($target.Name -ne 'LOCAL') { Write-Host 'Externes Ziel: ausschliesslich Zielpruefung; kein Start/Seed/Migrationslauf implementiert.' }
    if ($DryRun) { Write-Host 'DRYRUN: keine Prozesse, Dateien oder Verbindungen gestartet.'; exit 0 }
    if ($target.Db.Host -ne '127.0.0.1' -or $target.Db.Port -ne 55443 -or $target.Db.AbsolutePath -ne '/dev_l2' -or $target.Db.UserInfo -ne 'postgres' -or $target.Db.Query -or $target.Api.AbsoluteUri.TrimEnd('/') -ne 'http://127.0.0.1:8112') { throw 'Only disposable local target supported' }
    & "$PSScriptRoot/scripts/dev/start-local.ps1"
    exit $LASTEXITCODE
} catch {
    # URI/driver exception details can contain credentials.
    Write-Host 'FEHLER: Ziel ungueltig oder lokaler Start fehlgeschlagen. Siehe docs/ops/lokal-entwickeln.md.' -ForegroundColor Red
    exit 1
}
