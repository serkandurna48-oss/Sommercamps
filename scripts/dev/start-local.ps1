# Internal implementation: accepts no target URLs.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/process.ps1"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$python = Join-Path $root 'scripts/dev/.venv/Scripts/python.exe'
if (-not (Test-Path $python)) { throw 'Create scripts/dev/.venv and install backend_saas/requirements.txt first' }
if (-not (Test-Path "$root/frontend/node_modules/next")) { throw 'Run npm ci in frontend first' }
# Fail closed rather than read unknown frontend dotenv configuration.
$envFiles = Get-ChildItem -LiteralPath "$root/frontend" -Force -File | Where-Object { $_.Name -in @('.env','.env.local','.env.development','.env.development.local') }
if ($envFiles) { throw 'Remove frontend dotenv files from this worktree; launcher supplies isolated configuration' }
# Refuse occupied ports before starting either service.
foreach ($port in @(8112,3112)) {
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $port)
    try { $listener.Start() } finally { $listener.Stop() }
}
# Local Postgres on 127.0.0.1:55443: Serkan's machine has a private helper,
# everyone else uses a throwaway Docker container (see docs/cto/04).
$pgHelper = "$env:USERPROFILE/dev/_tools/pg-start.ps1"
if (Test-Path $pgHelper) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $pgHelper
    if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL failed' }
} else {
    $pgUp = $false
    try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 55443); $c.Close(); $pgUp = $true } catch {}
    if (-not $pgUp) {
        docker run -d --name campspilot-dev-pg -p 127.0.0.1:55443:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, or run your own throwaway Postgres on 127.0.0.1:55443' }
        foreach ($i in 1..30) { docker exec campspilot-dev-pg pg_isready -U postgres *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep 1 }
    }
}
& $python -I "$PSScriptRoot/local.py" init
if ($LASTEXITCODE -ne 0) { throw 'Local initialization failed' }
$runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force $runtime | Out-Null
$started = @()
try {
    foreach ($spec in @(@('backend', $python, @('-I', "`"$PSScriptRoot/local.py`"", 'backend')), @('frontend', 'node.exe', @("`"$PSScriptRoot/frontend.cjs`"")))) {
        $process = Start-IsolatedDevProcess -FilePath $spec[1] -Arguments $spec[2] -WorkingDirectory $root -OutputLog "$runtime/$($spec[0]).out.log" -ErrorLog "$runtime/$($spec[0]).err.log"
        $started += $process
        @{Id=$process.Id; StartTime=$process.StartTime.ToUniversalTime().Ticks} | ConvertTo-Json | Set-Content -LiteralPath "$runtime/$($spec[0]).json"
    }
    $deadline = (Get-Date).AddSeconds(45)
    $ready = $false
    while ((Get-Date) -lt $deadline) {
        if (@($started | Where-Object { $_.HasExited }).Count) { throw 'Local service exited' }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8112/health' -TimeoutSec 2
            $client = New-Object Net.Sockets.TcpClient
            try { $client.Connect('127.0.0.1',3112); $ready = $health.service -eq 'campspilot-saas-api' -and $health.database -eq 'ok' } finally { $client.Dispose() }
            if ($ready) { break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'Local services did not become ready' }
    Write-Host 'LOCAL: http://127.0.0.1:3112/pilot/jk-academy-demo | API http://127.0.0.1:8112/health'
    exit 0
} catch {
    & "$PSScriptRoot/stop-local.ps1"
    throw
}
