# Test isolation before the child runtime starts, including NODE_OPTIONS.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/process.ps1"
$temp = Join-Path ([IO.Path]::GetTempPath()) ('l2-process-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Force $temp | Out-Null
@'
const assert = require('node:assert/strict');
for (const key of ['NODE_OPTIONS','DATABASE_URL','BREVO_API_KEY','PGHOSTADDR']) {
  assert.equal(process.env[key], undefined, key + ' must be absent');
}
assert.ok(process.env.SystemRoot || process.env.SYSTEMROOT);
console.log('PASS clean child environment');
'@ | Set-Content -Encoding UTF8 "$temp/check.cjs"
$saved = @{}
foreach ($key in @('NODE_OPTIONS','DATABASE_URL','BREVO_API_KEY','PGHOSTADDR')) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key,'Process')
    [Environment]::SetEnvironmentVariable($key,'synthetic-invalid-value','Process')
}
try {
    $p = Start-IsolatedDevProcess -FilePath 'node.exe' -Arguments @("`"$temp/check.cjs`"") -WorkingDirectory $temp -OutputLog "$temp/out.log" -ErrorLog "$temp/err.log"
    if (-not $p.WaitForExit(10000)) { $p.Kill(); throw 'Child timed out' }
    if ($p.ExitCode -ne 0 -or (Get-Content -Raw "$temp/out.log") -notmatch 'PASS clean child environment') { throw "Child isolation failed, exit=$($p.ExitCode): $(Get-Content -Raw "$temp/err.log") $(Get-Content -Raw "$temp/out.log")" }
    foreach ($key in $saved.Keys) {
        if ([Environment]::GetEnvironmentVariable($key,'Process') -ne 'synthetic-invalid-value') { throw 'Caller environment not restored' }
    }
    Write-Host 'PASS pre-runtime child isolation and caller restoration; SKIPPED_TESTS=0'
} finally {
    foreach ($key in $saved.Keys) { [Environment]::SetEnvironmentVariable($key,$saved[$key],'Process') }
    $resolved = [IO.Path]::GetFullPath($temp)
    if ($resolved.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $resolved -Leaf) -like 'l2-process-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
