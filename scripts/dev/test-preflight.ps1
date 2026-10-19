# Exercise real preflight logic in a disposable skeleton; never invoke services.
$ErrorActionPreference = 'Stop'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('l2-preflight-' + [Guid]::NewGuid())
New-Item -ItemType Directory -Force "$temp/scripts/dev/.venv/Scripts", "$temp/frontend/node_modules/next" | Out-Null
Copy-Item "$PSScriptRoot/start-local.ps1", "$PSScriptRoot/process.ps1" "$temp/scripts/dev/"
New-Item -ItemType File "$temp/scripts/dev/.venv/Scripts/python.exe" | Out-Null
# Any attempted PostgreSQL launcher invocation is a test failure, not a command.
function powershell { throw 'PROCESS_STEP_REACHED' }
$listener = $null
try {
    foreach ($name in @('.env','.env.local','.env.development','.env.development.local')) {
        Set-Content -LiteralPath "$temp/frontend/$name" -Value 'synthetic-do-not-read'
        $caught = $false
        try { & "$temp/scripts/dev/start-local.ps1" } catch {
            if ($_.Exception.Message -notmatch 'Remove frontend dotenv files') { throw }
            $caught = $true
        }
        if (-not $caught) { throw 'Dotenv file was accepted' }
        Remove-Item -LiteralPath "$temp/frontend/$name"
        Write-Host "PASS preflight rejects $name before process step"
    }
    foreach ($port in @(8112,3112)) {
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$port)
        $listener.Start()
        $caught = $false
        try { & "$temp/scripts/dev/start-local.ps1" } catch {
            if ($_.Exception.Message -match 'PROCESS_STEP_REACHED') { throw }
            $caught = $true
        } finally { $listener.Stop(); $listener=$null }
        if (-not $caught) { throw "Occupied port $port was accepted" }
        Write-Host "PASS preflight rejects occupied port $port before process step"
    }
    Write-Host '6 preflight tests passed; SKIPPED_TESTS=0'
} finally {
    if ($listener) { $listener.Stop() }
    $resolved = [IO.Path]::GetFullPath($temp)
    if ($resolved.StartsWith([IO.Path]::GetTempPath()) -and (Split-Path $resolved -Leaf) -like 'l2-preflight-*') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
