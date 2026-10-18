# test-guards.ps1 — smoke tests for .claude/hooks/guard-prod.ps1
# 5 commands must be blocked (exit 2), 5 must pass through (exit 0).
# Results are printed to stdout and appended to UEBERGABE-T3.md.
#
# Usage: pwsh -NoProfile -File scripts/test-guards.ps1

param(
    [string]$UebergabePath = "C:\Users\serka\dev\_reports\auftraege\UEBERGABE-T3.md"
)

$guardScript = Join-Path (Split-Path $PSScriptRoot -Parent) ".claude\hooks\guard-prod.ps1"

if (-not (Test-Path $guardScript)) {
    Write-Error "guard-prod.ps1 nicht gefunden: $guardScript"
    exit 1
}

function Test-Guard {
    param(
        [string]$Description,
        [string]$Command,
        [bool]$ExpectBlocked
    )
    $payload = [PSCustomObject]@{
        tool_name  = "Bash"
        tool_input = [PSCustomObject]@{ command = $Command }
    } | ConvertTo-Json -Compress -Depth 3

    $output = $payload | pwsh -NoProfile -File $guardScript 2>&1
    $blocked = ($LASTEXITCODE -eq 2)
    $passed  = ($blocked -eq $ExpectBlocked)

    [PSCustomObject]@{
        Nr        = $null
        Erwartet  = if ($ExpectBlocked) { "BLOCKIERT" } else { "ERLAUBT" }
        Ergebnis  = if ($blocked)       { "BLOCKIERT" } else { "ERLAUBT" }
        Status    = if ($passed)        { "OK" }        else { "FEHLER" }
        Beschreibung = $Description
        Meldung   = ($output -join " ").Trim()
    }
}

$tests = @(
    # --- 5 blockierte Befehle ---
    @{ D="git push auf Branch";             C='git push origin chore/guards';                               B=$true  }
    @{ D="gh pr merge";                     C='gh pr merge 42 --squash';                                    B=$true  }
    @{ D="curl POST an Render-Prod";        C='curl -X POST https://sommercamps-0aod.onrender.com/registrations -d "{}"'; B=$true }
    @{ D="IRM POST an Render-Prod";         C='Invoke-RestMethod -Uri https://sommercamps-0aod.onrender.com/admin/login -Method Post -Body "{}"'; B=$true }
    @{ D="psql DELETE auf Supabase-Prod";   C='psql "host=db.wkmckfbzhmihyfwiekct.supabase.co" -c "DELETE FROM camp_registrations WHERE id=999"'; B=$true }
    # --- 5 erlaubte Befehle ---
    @{ D="curl GET Prod-Health";            C='curl https://sommercamps-0aod.onrender.com/health';           B=$false }
    @{ D="curl GET explizit";               C='curl -X GET https://sommercamps-0aod.onrender.com/registrations'; B=$false }
    @{ D="git status (kein push)";          C='git status --short';                                         B=$false }
    @{ D="npm run dev (kein Prod-URL)";     C='npm run dev';                                                B=$false }
    @{ D="curl POST auf Staging (kein Prod)"; C='curl -X POST https://api.staging.example.com/data -d "{}"'; B=$false }
)

$results = @()
$nr = 1
foreach ($t in $tests) {
    $r = Test-Guard -Description $t.D -Command $t.C -ExpectBlocked $t.B
    $r.Nr = $nr++
    $results += $r
}

# --- Ausgabe Konsole ---
$passed  = ($results | Where-Object { $_.Status -eq "OK" }).Count
$failed  = ($results | Where-Object { $_.Status -eq "FEHLER" }).Count

$results | Format-Table Nr, Status, Erwartet, Ergebnis, Beschreibung -AutoSize
Write-Host "Ergebnis: $passed/10 bestanden, $failed Fehler"

# --- Ausgabe in Übergabedatei anhängen ---
$lines = @()
$lines += ""
$lines += "## guard-test-guards.ps1 Ergebnis"
$lines += ""
$lines += "| Nr | Status | Erwartet | Ergebnis | Beschreibung |"
$lines += "|---|---|---|---|---|"
foreach ($r in $results) {
    $lines += "| $($r.Nr) | $($r.Status) | $($r.Erwartet) | $($r.Ergebnis) | $($r.Beschreibung) |"
}
$lines += ""
$lines += "**$passed/10 bestanden**, $failed Fehler"
$lines += ""

if (Test-Path $UebergabePath) {
    Add-Content -Path $UebergabePath -Value ($lines -join "`n") -Encoding UTF8
    Write-Host "Angehaengt an: $UebergabePath"
} else {
    Write-Warning "Uebergabedatei nicht gefunden: $UebergabePath — Testergebnis nur auf Konsole."
}

if ($failed -gt 0) { exit 1 }
exit 0
