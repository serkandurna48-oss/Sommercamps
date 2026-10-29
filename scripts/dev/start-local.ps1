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
        cmd /c "docker info >nul 2>&1"
        if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop, or run your own throwaway Postgres on 127.0.0.1:55443' }
        $existing = (cmd /c "docker ps -a --filter name=^campspilot-dev-pg$ --format {{.Names}} 2>nul")
        if ($existing -eq 'campspilot-dev-pg') {
            cmd /c "docker start campspilot-dev-pg >nul 2>&1"
        } else {
            cmd /c "docker run -d --name campspilot-dev-pg -p 127.0.0.1:55443:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >nul 2>&1"
        }
        if ($LASTEXITCODE -ne 0) { throw 'Could not start the campspilot-dev-pg container' }
        $ready = $false
        foreach ($i in 1..60) {
            cmd /c "docker exec campspilot-dev-pg pg_isready -h 127.0.0.1 -U postgres >nul 2>&1"
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep 1
        }
        if (-not $ready) { throw 'Postgres in campspilot-dev-pg did not become ready' }
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
