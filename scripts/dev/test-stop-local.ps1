# Ownership checks use only a disposable sleeper process, no server or network.
$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('l2-stop-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Force "$temp/.runtime" | Out-Null
Copy-Item "$PSScriptRoot/stop-local.ps1" "$temp/stop-local.ps1"
$sleeper = Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 60' -WindowStyle Hidden -PassThru
try {
    @{Id=$sleeper.Id; StartTime=($sleeper.StartTime.ToUniversalTime().Ticks + 10000000)} | ConvertTo-Json | Set-Content "$temp/.runtime/backend.json"
    & "$temp/stop-local.ps1"
    if (-not (Get-Process -Id $sleeper.Id -ErrorAction SilentlyContinue)) { throw 'Stale PID record killed process' }
    Write-Host 'PASS mismatched start time preserves process'
    @{Id=$sleeper.Id; StartTime=$sleeper.StartTime.ToUniversalTime().Ticks} | ConvertTo-Json | Set-Content "$temp/.runtime/backend.json"
    & "$temp/stop-local.ps1"
    if (Get-Process -Id $sleeper.Id -ErrorAction SilentlyContinue) { throw 'Owned process still running' }
    Write-Host 'PASS matching process stopped'
    & "$temp/stop-local.ps1"
    Write-Host 'PASS repeated stop succeeds; SKIPPED_TESTS=0'
} finally {
    Stop-Process -Id $sleeper.Id -ErrorAction SilentlyContinue
    $resolved = [IO.Path]::GetFullPath($temp)
    if ($resolved.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $resolved -Leaf) -like 'l2-stop-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
