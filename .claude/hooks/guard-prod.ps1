# Read and classify only. Never execute tool_input.command.
$ErrorActionPreference = 'Stop'
function Deny-Command([string]$Reason) {
    [Console]::Error.WriteLine("Prod guard: blocked - $Reason")
    exit 2
}
try {
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json -ErrorAction Stop
    if ($null -eq $payload -or $payload.tool_name -notin @('Bash', 'PowerShell')) {
        Deny-Command 'invalid shell tool payload'
    }
    $command = $payload.tool_input.command
    if ($command -isnot [string] -or [string]::IsNullOrWhiteSpace($command)) {
        Deny-Command 'missing command string'
    }

    # Join shell continuations and remove literal quoting/PowerShell escapes.
    # Conservative matching can also deny text in comments or quoted examples.
    $text = $command -replace '\\?\r?\n', ' '
    $text = $text -replace '[`''"]', ''
    # Scan conservatively across the whole payload: quoted option values may
    # contain shell separators before the actual push/merge subcommand.
    $git = '(?i)(?<![\w-])git(?:\.exe)?\s+.*?\bpush(?=\s|[;|&<>)]|$)'
    $merge = '(?i)(?<![\w-])gh(?:\.exe)?\s+.*?\bpr\s+merge(?=\s|[;|&<>)]|$)'
    if ($text -match $git) { Deny-Command 'git push is disabled on every branch' }
    if ($text -match $merge) { Deny-Command 'gh pr merge is disabled' }

    $production = '(?i)sommercamps-0aod|wkmckfbzhmihyfwiekct|asowsktznpiioaxerlta|campspilot\.vercel\.app'
    if ($text -match $production) {
        $writeVerb = '(?i)\b(POST|PUT|PATCH|DELETE|INSERT|UPDATE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|COPY|CALL|DO|MERGE)\b'
        # curl short flags are case sensitive: -F writes, -f only fails on HTTP errors.
        $bodyFlag = '(?:^|\s)(?:--(?i:data(?:-[a-z]+)?|form(?:-string)?|upload-file|json)(?:[=\s]|$)|-(?i:Body|InFile)(?:[\s:]|$))'
        $curlBody = $text -match '(?i)(?<![\w-])curl(?:\.exe)?\s' -and
            $text -cmatch '(?:^|\s)-[sSfLvkiI0-9]*[dFT]\S*'
        # psql can execute SQL from stdin, startup files, or -f: deny all prod sessions.
        $sqlClient = '(?i)(?<![\w-])psql(?:\.exe)?(?=\s|[;|&<>)]|$)'
        $compactMethod = '(?i)(?:^|\s)-X(?:POST|PUT|PATCH|DELETE)(?=\s|$)'
        if ($text -match $writeVerb -or $text -cmatch $bodyFlag -or $curlBody -or $text -match $sqlClient -or $text -match $compactMethod) {
            Deny-Command 'production write request or SQL session'
        }
    }
    exit 0
} catch {
    # Parsing/classification errors must never silently allow a shell command.
    Deny-Command 'invalid payload or guard failure'
}
