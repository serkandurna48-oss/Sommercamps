<#
.SYNOPSIS
  Harte Prüfung vor Review-Start und Übergabe: Der PR-Head auf GitHub muss exakt
  der SHA sein, der lokal getestet wurde.

.DESCRIPTION
  Verhindert den Fall vom 17.10.2026 (PR #26/#27 enthielten noch c9a6b2f, die
  Korrekturen lagen nur lokal → Nachprüfung + Korrektur-PR #29).

  Nutzt nur `git ls-remote` (kein gh, keine Anmeldung nötig bei öffentlichem Repo).
  Exit 0 = identisch, Exit 1 = Abweichung/Fehler. Bei Exit 1 KEIN Review starten,
  KEINE Abnahme melden.

.EXAMPLE
  ./scripts/check-review-sha.ps1 -Pr 29
  # prüft PR #29 gegen den lokalen HEAD (Arbeitsbaum muss sauber sein)

.EXAMPLE
  ./scripts/check-review-sha.ps1 -Pr 29 -TestedSha b1945e64ad4334fe64a13029aefde2c5f691b3e7
#>
param(
  [Parameter(Mandatory = $true)][int]$Pr,
  [string]$TestedSha = "",
  [string]$Remote = "origin"
)
$ErrorActionPreference = "Stop"

function Fail([string]$msg) { Write-Host "REVIEW-SHA-CHECK FEHLGESCHLAGEN: $msg" -ForegroundColor Red; exit 1 }

if (-not $TestedSha) {
  $dirty = git status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) { Fail "git status fehlgeschlagen (kein Git-Repository?)." }
  if ($dirty) { Fail "Arbeitsbaum hat uncommittete Änderungen. Erst committen und pushen, dann erneut prüfen." }
  $TestedSha = (git rev-parse HEAD).Trim()
}
$TestedSha = $TestedSha.Trim().ToLower()
if ($TestedSha -notmatch '^[0-9a-f]{40}$') { Fail "TestedSha '$TestedSha' ist kein vollständiger 40-stelliger SHA." }

$line = git ls-remote $Remote "refs/pull/$Pr/head"
if ($LASTEXITCODE -ne 0 -or -not $line) { Fail "PR #$Pr auf '$Remote' nicht gefunden (ls-remote leer)." }
$prHead = ($line -split "\s+")[0].Trim().ToLower()

if ($prHead -ne $TestedSha) {
  Fail "PR #$Pr zeigt auf $prHead, getestet wurde $TestedSha. Fehlende Commits pushen (oder am PR-Head neu testen), dann erneut prüfen."
}
Write-Host "OK: PR #$Pr head = getesteter SHA $TestedSha" -ForegroundColor Green
exit 0
