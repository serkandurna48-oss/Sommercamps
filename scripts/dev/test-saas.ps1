# Run the same SaaS checks as .github/workflows/ci-saas.yml on Windows.
# Needs: Docker Desktop (or -UseExistingPostgres), Python 3.13 (py launcher), Node 24.
# Safety: Postgres is a throwaway container bound to 127.0.0.1:55443, tests only
# connect to 127.0.0.1, no mail provider (APP_ENV=test). Refuses to run if
# backend_saas/.env exists (Settings would read it).
# After scripts/dev/start-local.ps1 port 55443 is busy: -UseExistingPostgres is
# fine then (tests create their own databases).
#
#   powershell -ExecutionPolicy Bypass -File scripts/dev/test-saas.ps1
#   ... -Backend | -Frontend | -Build | -UseExistingPostgres
param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Build,
    [switch]$UseExistingPostgres
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runBackend = $Backend -or -not $Frontend
$runFrontend = $Frontend -or -not $Backend
$pgName = 'campspilot-test-pg'
$startedPg = $false

function Invoke-Checked([string]$label, [scriptblock]$block) {
    & $block
    if ($LASTEXITCODE -ne 0) { throw "$label failed (exit $LASTEXITCODE)" }
}

function Wait-Postgres([string]$container) {
    # Probe over TCP: the image's temporary init server only listens on the socket.
    foreach ($i in 1..60) {
        cmd /c "docker exec $container pg_isready -h 127.0.0.1 -U postgres >nul 2>&1"
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep 1
    }
    throw "Postgres in $container did not become ready"
}

try {
    if ($runBackend) {
        if (-not $UseExistingPostgres) {
            $busy = $false
            try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 55443); $c.Close(); $busy = $true } catch {}
            if ($busy) { throw 'Port 55443 is busy. Stop that Postgres or pass -UseExistingPostgres (only for a throwaway local DB).' }
            Invoke-Checked 'docker run' { docker run --rm -d --name $pgName -p 127.0.0.1:55443:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 | Out-Null }
            $startedPg = $true
            Wait-Postgres $pgName
        }
        if (Test-Path "$root/backend_saas/.env") { throw 'backend_saas/.env exists. Move it away: tests must not read real settings.' }
        Push-Location "$root/backend_saas"
        try {
            if (-not (Test-Path .venv)) { Invoke-Checked 'venv' { py -3.13 -m venv .venv } }
            $py = Resolve-Path '.venv/Scripts/python.exe'
            Invoke-Checked 'pip install' { & $py -m pip install -q -r requirements.txt }
            $saved = @{}
            $testEnv = @{
                APP_ENV = 'test'
                DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/not_a_real_database'
                SUPABASE_URL = 'https://test-project.supabase.co'
                SUPABASE_ANON_KEY = 'test-anon-key-not-real'
                REVIEW_POSTGRES_PORT = '55443'
                NOTIFICATION_PROVIDER = ''
                SUPABASE_SERVICE_ROLE_KEY = ''
            }
            foreach ($k in $testEnv.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k); [Environment]::SetEnvironmentVariable($k, $testEnv[$k]) }
            try {
                Invoke-Checked 'pytest' { & $py -m pytest -q tests }
                Invoke-Checked 'compileall' { & $py -m compileall -q app }
            } finally {
                foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
            }
        } finally { Pop-Location }
    }
    if ($runFrontend) {
        Push-Location "$root/frontend"
        try {
            if (-not (Test-Path node_modules)) { Invoke-Checked 'npm ci' { npm ci } }
            $savedFe = @{ NEXT_PUBLIC_SAAS_API_URL = $env:NEXT_PUBLIC_SAAS_API_URL; NEXT_PUBLIC_ACTIVE_CLUB = $env:NEXT_PUBLIC_ACTIVE_CLUB }
            $env:NEXT_PUBLIC_SAAS_API_URL = 'http://127.0.0.1:8001'
            $env:NEXT_PUBLIC_ACTIVE_CLUB = 'ksv'
            try {
                Invoke-Checked 'vitest' { npm test }
                Invoke-Checked 'tsc' { npx tsc --noEmit }
                Invoke-Checked 'lint' { npm run lint }
                if ($Build) { Invoke-Checked 'build' { npm run build } }
            } finally {
                foreach ($k in $savedFe.Keys) { [Environment]::SetEnvironmentVariable($k, $savedFe[$k]) }
            }
        } finally { Pop-Location }
    }
    Write-Host 'SaaS checks passed.'
} finally {
    if ($startedPg) { cmd /c "docker rm -f $pgName >nul 2>&1" }
}
