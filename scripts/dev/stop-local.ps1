# Stop only launcher-owned processes whose start time still matches the PID record.
$ErrorActionPreference = 'Stop'
foreach ($name in @('frontend','backend')) {
    $record = Join-Path $PSScriptRoot ".runtime/$name.json"
    if (-not (Test-Path $record)) { continue }
    $saved = Get-Content -Raw -LiteralPath $record | ConvertFrom-Json
    $process = Get-Process -Id $saved.Id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().Ticks -eq $saved.StartTime) {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = Join-Path $env:SystemRoot 'System32/taskkill.exe'
        $info.Arguments = "/PID $($process.Id) /T /F"
        $info.UseShellExecute = $false; $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
        $killer = [Diagnostics.Process]::Start($info)
        $stdout = $killer.StandardOutput.ReadToEndAsync(); $stderr = $killer.StandardError.ReadToEndAsync()
        if (-not $killer.WaitForExit(10000)) { $killer.Kill(); throw "Stop timed out for $name" }
        # Windows venv redirectors may exit when their child exits, before taskkill
        # reaches the parent. Its nonzero result then still means the tree stopped.
        $remaining = Get-Process -Id $saved.Id -ErrorAction SilentlyContinue
        if ($remaining -and $remaining.StartTime.ToUniversalTime().Ticks -eq $saved.StartTime) { throw "Failed to stop local $name" }
    }
    Remove-Item -LiteralPath $record
}
Write-Host 'Lokale L2-Dienste beendet; PostgreSQL bleibt fuer andere Sessions verfuegbar.'
