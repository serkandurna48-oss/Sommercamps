# Stop only launcher-owned processes whose start time still matches the PID record.
$ErrorActionPreference = 'Stop'
foreach ($name in @('frontend','backend')) {
    $record = Join-Path $PSScriptRoot ".runtime/$name.json"
    if (-not (Test-Path $record)) { continue }
    $saved = Get-Content -Raw -LiteralPath $record | ConvertFrom-Json
    $process = Get-Process -Id $saved.Id -ErrorAction SilentlyContinue
    $processStart = if ($process) { $process.StartTime } else { $null }
    if ($processStart -and $processStart.ToUniversalTime().Ticks -eq $saved.StartTime) {
        # Keep the verified process handle: a fresh PID lookup after taskkill
        # can still see a disappearing Windows process with no StartTime.
        $null = $process.Handle
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
        if (-not $process.WaitForExit(3000)) { throw "Failed to stop local $name" }
    }
    Remove-Item -LiteralPath $record
}
Write-Host 'Lokale L2-Dienste beendet; PostgreSQL bleibt fuer andere Sessions verfuegbar.'
