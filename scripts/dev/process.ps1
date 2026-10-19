function Start-IsolatedDevProcess {
    param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory,
          [string]$OutputLog, [string]$ErrorLog)
    $previous = @{}
    Get-ChildItem Env: | ForEach-Object { $previous[$_.Name] = $_.Value }
    $keep = @('SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA')
    try {
        foreach ($key in @($previous.Keys)) {
            if ($key -notin $keep) { [Environment]::SetEnvironmentVariable($key,$null,'Process') }
        }
        # NODE_OPTIONS/PYTHONPATH and secrets must be gone before the runtime starts.
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $OutputLog -RedirectStandardError $ErrorLog
        # Retain a native handle so Windows PowerShell can report ExitCode even
        # if a short-lived child exits before the caller waits for it.
        $null = $process.Handle
        return $process
    } finally {
        foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
    }
}
