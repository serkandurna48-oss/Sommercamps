#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$temp = Join-Path ([IO.Path]::GetTempPath()) ('l2-tests-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Force "$temp/scripts/dev" | Out-Null
Copy-Item "$root/start-dev.ps1" "$temp/start-dev.ps1"
Copy-Item "$PSScriptRoot/target.ps1" "$temp/scripts/dev/target.ps1"
Set-Content "$temp/scripts/dev/start-local.ps1" "Set-Content -LiteralPath '$temp/started' -Value yes; exit 0"
$count = 0
function Check {
    param([string]$Name, [string]$Arguments, [int]$Code, [string]$Expected, [string]$Allow = '',
          [string]$EnvName = '', [string]$EnvValue = '', [switch]$SendConfirmation)
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = 'powershell.exe'
    $info.Arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$temp/start-dev.ps1`" $Arguments"
    $info.UseShellExecute = $false
    $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true; $info.RedirectStandardInput = $true
    $info.EnvironmentVariables.Remove('DATABASE_URL')
    $info.EnvironmentVariables.Remove('NEXT_PUBLIC_SAAS_API_URL')
    $info.EnvironmentVariables.Remove('NEXT_PUBLIC_API_URL')
    $info.EnvironmentVariables['ALLOW_PROD_WRITES'] = $Allow
    if ($EnvName) { $info.EnvironmentVariables[$EnvName] = $EnvValue }
    $p = [Diagnostics.Process]::Start($info)
    if ($SendConfirmation) { $p.StandardInput.WriteLine('PROD') }
    $p.StandardInput.Close()
    $stdout = $p.StandardOutput.ReadToEndAsync(); $stderr = $p.StandardError.ReadToEndAsync()
    if (-not $p.WaitForExit(15000)) { $p.Kill(); throw "$Name timed out" }
    $output = $stdout.Result + $stderr.Result
    if ($p.ExitCode -ne $Code -or $output -notmatch $Expected) { throw "$Name failed: exit=$($p.ExitCode), expected=$Code; $output" }
    if ($output -match 'synthetic-password') { throw "$Name leaked URL credentials" }
    $script:count++
    Write-Host "PASS $Name (exit $Code)"
}
try {
    Check 'local default delegates only after guard' '' 0 'LOCAL.*DB-HOST: 127.0.0.1'
    if (-not (Test-Path "$temp/started")) { throw 'Default did not delegate' }
    Remove-Item -LiteralPath "$temp/started"
    Check 'prod DB without flag' '-DatabaseUrl postgresql://postgres@db.wkmckfbzhmihyfwiekct.supabase.co/postgres -DryRun' 2 'PROD gesperrt'
    Check 'prod API without flag' '-ApiUrl https://sommercamps-0aod.onrender.com -DryRun' 2 'PROD gesperrt'
    Check 'prod flag without interactive confirmation' '-ApiUrl https://campspilot.vercel.app -DryRun' 2 'PROD gesperrt' 'yes'
    Check 'staging warning' '-ApiUrl https://staging.campspilot.example -DryRun' 0 'STAGING: externes Ziel'
    Check 'malformed database URL' '-DatabaseUrl broken -DryRun' 1 'FEHLER'
    Check 'malformed API URL' '-ApiUrl file:///tmp/test -DryRun' 1 'FEHLER'
    Check 'unknown remote fails closed' '-ApiUrl https://unknown.campspilot.example -DryRun' 2 'PROD gesperrt'
    Check 'second production reference' '-DatabaseUrl postgresql://postgres.asowsktznpiioaxerlta@pool.example/postgres -DryRun' 2 'PROD gesperrt'
    Check 'encoded production reference' '-DatabaseUrl postgresql://postgres.%77kmckfbzhmihyfwiekct@pool.example/postgres -DryRun' 2 'PROD gesperrt'
    Check 'uppercase production reference' '-ApiUrl https://CAMPSPILOT.VERCEL.APP -DryRun' 2 'PROD gesperrt'
    Check 'production marker on loopback' '-DatabaseUrl postgresql://postgres@127.0.0.1:55443/production -DryRun' 2 'PROD gesperrt'
    Check 'invalid database scheme' '-DatabaseUrl https://localhost/dev_l2 -DryRun' 1 'FEHLER'
    Check 'API with credentials rejected' '-ApiUrl http://user:synthetic-password@127.0.0.1:8112 -DryRun' 1 'FEHLER'
    Check 'database credentials never printed' '-DatabaseUrl postgresql://postgres:synthetic-password@127.0.0.1:55443/dev_l2 -DryRun' 0 'LOCAL'
    Check 'IPv6 loopback target' '-DatabaseUrl postgresql://postgres@[::1]:55443/dev_l2 -ApiUrl http://[::1]:8112 -DryRun' 0 'LOCAL'
    Check 'staging password cannot relabel unknown host' '-DatabaseUrl postgresql://user:staging@unknown.example/postgres -DryRun' 2 'PROD gesperrt'
    Check 'inherited DATABASE_URL guarded' '-DryRun' 2 'PROD gesperrt' '' 'DATABASE_URL' 'postgresql://postgres@db.wkmckfbzhmihyfwiekct.supabase.co/postgres'
    Check 'inherited SaaS API guarded' '-DryRun' 2 'PROD gesperrt' '' 'NEXT_PUBLIC_SAAS_API_URL' 'https://sommercamps-0aod.onrender.com'
    Check 'inherited legacy API guarded' '-DryRun' 2 'PROD gesperrt' '' 'NEXT_PUBLIC_API_URL' 'https://campspilot.vercel.app'
    Check 'redirected PROD is not interactive approval' '-ApiUrl https://campspilot.vercel.app -DryRun' 2 'PROD gesperrt' 'yes' -SendConfirmation
    Check 'dryrun has no side effects' '-DryRun' 0 'DRYRUN'
    if (Test-Path "$temp/started") { throw 'A blocked or dry-run case started local execution' }
    Write-Host "$count tests passed; SKIPPED_TESTS=0"
} finally {
    # The only recursive delete targets our verified unique temporary directory.
    $resolved = [IO.Path]::GetFullPath($temp)
    if ($resolved.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $resolved -Leaf) -like 'l2-tests-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
