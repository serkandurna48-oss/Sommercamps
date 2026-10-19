# install-guards.ps1 — installs the post-checkout guard in the MAIN repo.
# NOT called automatically — run once manually:
#   pwsh -NoProfile -File scripts/install-guards.ps1
#
# The hook warns and auto-reverts if someone switches away from demo/jan
# in the main worktree. It is a no-op in linked worktrees (cp-t3-guards, etc.).

param(
    [string]$MainRepoPath = "C:\Users\serka\Desktop\Projekte\Sommercamps",
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$guardPath = Join-Path $projectRoot '.claude/hooks/guard-prod.ps1'
$settingsPath = Join-Path $projectRoot '.claude/settings.json'
try {
    if (-not (Test-Path -LiteralPath $guardPath -PathType Leaf)) { throw 'Prod guard script missing' }
    $settings = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction Stop
    $registration = @($settings.hooks.PreToolUse | Where-Object { $_.matcher -eq 'Bash|PowerShell' })
    $expectedArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-prod.ps1')
    if ($registration.Count -ne 1 -or $registration[0].hooks[0].command -ne 'powershell.exe' -or
        $registration[0].hooks[0].onFailure -ne 'block' -or
        ($registration[0].hooks[0].args -join '|') -cne ($expectedArgs -join '|')) {
        throw 'Prod guard registration invalid'
    }
    foreach ($rule in @('Bash(git push*)', 'Bash(gh pr merge*)', 'PowerShell(git push*)', 'PowerShell(gh pr merge*)')) {
        if ($settings.permissions.deny -notcontains $rule) { throw "Missing deny rule: $rule" }
    }
} catch {
    Write-Error $_
    exit 1
}
Write-Host 'Prod guard tracked and registered. Requires Claude Code >= 2.1.295 and Windows PowerShell 5.1.'
if ($ValidateOnly) {
    Write-Host 'Validation only; no Git hook installation.'
    exit 0
}

$commonDir = (& git -C $MainRepoPath rev-parse --path-format=absolute --git-common-dir 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $commonDir) {
    Write-Error "Kein git-Repo: $MainRepoPath"
    exit 1
}
$hooksDir = Join-Path $commonDir 'hooks'
$configuredHooksPath = & git -C $MainRepoPath config --get core.hooksPath
if ($LASTEXITCODE -ne 1) {
    throw 'core.hooksPath is configured or cannot be checked; shared hooks would not reliably protect this repository.'
}
if (-not (Test-Path -LiteralPath $hooksDir -PathType Container)) {
    Write-Error "Git hooks-Ordner fehlt: $hooksDir"
    exit 1
}

function Install-GitHook([string]$Name, [string]$Content) {
    $path = Join-Path $hooksDir $Name
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $backup = $path + '.backup-' + [guid]::NewGuid().ToString('N')
        Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop
        Write-Host "Gesichert: $backup"
    }
    [System.IO.File]::WriteAllText($path, $Content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Installiert: $path"
}

# Unix LF endings are required — git on Windows runs hooks via sh.
$hookContent = "#!/bin/sh`n" +
"# post-checkout: warn and auto-revert if demo/jan is left in the MAIN folder.`n" +
"# Installed by scripts/install-guards.ps1 (chore/guards).`n" +
"# Skips automatically when running inside a linked worktree.`n" +
"branch_checkout=`"`$3`"`n" +
"`n" +
"# Not a branch switch — nothing to check.`n" +
"[ `"`$branch_checkout`" = `"1`" ] || exit 0`n" +
"`n" +
"# Linked worktrees have a private git dir distinct from the common dir.`n" +
"git_dir=`$(git rev-parse --absolute-git-dir) || exit 1`n" +
"common_dir=`$(git rev-parse --path-format=absolute --git-common-dir) || exit 1`n" +
"[ `"`$git_dir`" = `"`$common_dir`" ] || exit 0`n" +
"`n" +
"new_branch=`$(git symbolic-ref --short HEAD 2>/dev/null)`n" +
"[ `"`$new_branch`" = `"demo/jan`" ] && exit 0`n" +
"`n" +
"echo `"`"`n" +
"echo `"WARNING: Hauptordner hat demo/jan verlassen (jetzt auf: `$new_branch).`"`n" +
"echo `"  Nur demo/jan sollte im Hauptordner ausgecheckt sein.`"`n" +
"`n" +
"if git diff --quiet && git diff --cached --quiet; then`n" +
"    echo `"  Tree ist sauber — wechsle automatisch zurueck zu demo/jan.`"`n" +
"    git checkout demo/jan`n" +
"else`n" +
"    echo `"  Working tree dirty — bitte manuell: git checkout demo/jan`"`n" +
"fi`n"

Install-GitHook 'post-checkout' $hookContent
$pushContent = @'
#!/bin/sh
# Shared across worktrees. Only an exact, explicit override permits a push.
if [ "$CAMPSPILOT_ALLOW_PUSH" = "yes-serkan" ]; then
    exit 0
fi
echo "CampsPilot pre-push: push blocked; CAMPSPILOT_ALLOW_PUSH must equal yes-serkan." >&2
exit 1
'@ -replace "`r`n", "`n"
Install-GitHook 'pre-push' $pushContent
Write-Host 'Prod guard uses tracked .claude/settings.json; restart Claude Code after applying the commit.'
Write-Host 'Payload-only tests: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-guards.ps1'
