# install-guards.ps1 — installs the post-checkout guard in the MAIN repo.
# NOT called automatically — run once manually:
#   pwsh -NoProfile -File scripts/install-guards.ps1
#
# The hook warns and auto-reverts if someone switches away from demo/jan
# in the main worktree. It is a no-op in linked worktrees (cp-t3-guards, etc.).

param(
    [string]$MainRepoPath = "C:\Users\serka\Desktop\Projekte\Sommercamps"
)

$hooksDir = Join-Path $MainRepoPath ".git\hooks"
if (-not (Test-Path $hooksDir)) {
    Write-Error "Kein git-Repo oder hooks-Ordner fehlt: $hooksDir"
    exit 1
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
"# Linked worktree: GIT_DIR contains 'worktrees' — leave it alone.`n" +
"case `"`$GIT_DIR`" in *worktrees*) exit 0 ;; esac`n" +
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

$hookPath = Join-Path $hooksDir "post-checkout"
[System.IO.File]::WriteAllText($hookPath, $hookContent)

Write-Host "Installiert: $hookPath"
Write-Host ""
Write-Host "Test (vom Hauptordner aus):"
Write-Host "  cd $MainRepoPath"
Write-Host "  git checkout -b probe-checkout-$(Get-Random)"
Write-Host "  # Hook sollte warnen und zu demo/jan zurueckwechseln"
