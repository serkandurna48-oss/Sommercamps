# Payload-only tests: command strings are data, never shell input.
param(
    [string]$GuardScript = (Join-Path (Split-Path $PSScriptRoot -Parent) '.claude/hooks/guard-prod.ps1'),
    [string]$ShellPath = (Join-Path $PSHOME $(if ($PSVersionTable.PSEdition -eq 'Core') { 'pwsh.exe' } else { 'powershell.exe' })),
    [string]$ReportPath,
    [switch]$Extended,
    [switch]$BoundarySweep
)
$ErrorActionPreference = 'Stop'
function Invoke-GuardPayload([string]$Hook, [string]$Payload, [string]$Executable = $ShellPath, [string]$Arguments) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = if ($Arguments) { $Arguments } else { '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Hook + '"' }
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        if (-not $process.Start()) { throw 'Hook process did not start' }
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($Payload)
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(10000)) {
            $process.Kill()
            throw 'Hook timeout'
        }
        [PSCustomObject]@{ Code = $process.ExitCode; Message = ($stdout.Result + $stderr.Result).Trim() }
    } finally { $process.Dispose() }
}
function Test-Guard([string]$Hook, [string]$Payload, [int]$Expected, [string]$Executable = $ShellPath, [string]$Arguments) {
    $actual = Invoke-GuardPayload $Hook $Payload $Executable $Arguments
    [PSCustomObject]@{
        Expected = $Expected
        Actual = $actual.Code
        Passed = ($actual.Code -eq $Expected -and ($Expected -ne 2 -or $actual.Message.Length -gt 0))
        Message = $actual.Message
    }
}
try {
    if (-not (Test-Path -LiteralPath $GuardScript -PathType Leaf)) { throw "Missing hook: $GuardScript" }
    $tests = @(
        @{ D='push arbitrary branch'; C='git push origin arbitrary/branch'; E=2 }
        @{ D='push all branches'; C='git push --all'; E=2 }
        @{ D='git global options'; C='git -C "C:/temporary repo" push origin HEAD'; E=2 }
        @{ D='merge'; C='gh pr merge 42 --squash'; E=2 }
        @{ D='gh repo option'; C='gh --repo demo/example pr merge 42'; E=2 }
        @{ D='prod POST'; C='curl -X POST https://sommercamps-0aod.onrender.com/example'; E=2 }
        @{ D='prod PUT'; C='curl --request=PUT https://campspilot.vercel.app/example'; E=2 }
        @{ D='prod PATCH'; C='curl -XPATCH https://asowsktznpiioaxerlta.supabase.co/rest/v1/example'; E=2 }
        @{ D='prod DELETE'; C='curl -X DELETE https://wkmckfbzhmihyfwiekct.supabase.co/rest/v1/example'; E=2 }
        @{ D='implicit POST short data'; C='curl https://sommercamps-0aod.onrender.com/example -d{}'; E=2 }
        @{ D='implicit POST long data'; C='curl https://campspilot.vercel.app/example --data-raw="{}"'; E=2 }
        @{ D='PowerShell POST'; C='Invoke-RestMethod -Uri https://sommercamps-0aod.onrender.com/example -Method Post -Body "{}"'; E=2 }
        @{ D='PowerShell alias PUT'; C='irm https://campspilot.vercel.app/example -Method:Put'; E=2 }
        @{ D='psql DELETE'; C='psql "host=db.wkmckfbzhmihyfwiekct.supabase.co" -c "DELETE FROM example"'; E=2 }
        @{ D='psql SQL file'; C='psql "host=db.asowsktznpiioaxerlta.supabase.co" -f example.sql'; E=2 }
        @{ D='SQL INSERT'; C='client wkmckfbzhmihyfwiekct "INSERT INTO example VALUES (1)"'; E=2 }
        @{ D='SQL UPDATE'; C='client asowsktznpiioaxerlta "UPDATE example SET value=1"'; E=2 }
        @{ D='SQL DROP'; C='client wkmckfbzhmihyfwiekct "DROP TABLE example"'; E=2 }
        @{ D='prod implicit GET'; C='curl https://sommercamps-0aod.onrender.com/health'; E=0 }
        @{ D='prod explicit GET'; C='curl -X GET https://campspilot.vercel.app/example'; E=0 }
        @{ D='PowerShell prod GET'; C='Invoke-RestMethod https://asowsktznpiioaxerlta.supabase.co/rest/v1/example -Method Get'; E=0 }
        @{ D='second Supabase GET'; C='curl https://wkmckfbzhmihyfwiekct.supabase.co/rest/v1/example'; E=0 }
        @{ D='staging POST'; C='curl -X POST https://api.staging.example.com/example -d "{}"'; E=0 }
        @{ D='local SQL'; C='psql -h 127.0.0.1 -p 55443 -c "DELETE FROM example"'; E=0 }
        @{ D='git status'; C='git status --short'; E=0 }
        @{ D='ordinary command'; C='npm run dev'; E=0 }
        @{ D='push word only'; C='Write-Output push'; E=0 }
        @{ D='data word only'; C='Write-Output data'; E=0 }
        @{ D='compound push'; C='git status; git push origin demo'; E=2 }
        @{ D='git exe path'; C='& "C:/Program Files/Git/cmd/git.exe" push origin demo'; E=2 }
        @{ D='case insensitive push'; C='GIT PUSH origin demo'; E=2 }
        @{ D='escaped push'; C='g`it pu`sh origin demo'; E=2 }
        @{ D='PowerShell PATCH'; C='Invoke-WebRequest https://campspilot.vercel.app/example -Method Patch'; E=2 }
        @{ D='PowerShell implicit body'; C='irm https://campspilot.vercel.app/example -Body "{}"'; E=2 }
        @{ D='curl JSON'; C='curl https://campspilot.vercel.app/example --json="{}"'; E=2 }
        @{ D='curl form'; C='curl https://campspilot.vercel.app/example -F example=value'; E=2 }
        @{ D='curl upload'; C='curl https://campspilot.vercel.app/example --upload-file example.txt'; E=2 }
        @{ D='prod HEAD'; C='curl -I https://campspilot.vercel.app/'; E=0 }
        @{ D='prod GET header'; C='curl https://campspilot.vercel.app/ -H "Accept: application/json"'; E=0 }
        @{ D='PowerShell staging POST'; C='irm https://api.staging.example.com/example -Method Post -Body "{}"'; E=0 }
        @{ D='push redirect'; C='git push>example.log'; E=2 }
        @{ D='merge redirect'; C='gh pr merge>example.log'; E=2 }
        @{ D='curl combined data flags'; C='curl -sd{} https://campspilot.vercel.app/example'; E=2 }
        @{ D='curl combined upload flags'; C='curl -sSTexample.txt https://campspilot.vercel.app/example'; E=2 }
        @{ D='curl safe combined flags'; C='curl -sSf https://campspilot.vercel.app/health'; E=0 }
        @{ D='curl output headers'; C='curl -D headers.txt https://campspilot.vercel.app/health'; E=0 }
        @{ D='PowerShell GET timeout'; C='irm https://campspilot.vercel.app/health -Method Get -TimeoutSec 5'; E=0 }
        @{ D='git option quoted pipe'; C='git -c user.name="A|B" push origin demo'; E=2 }
        @{ D='git option quoted semicolon'; C='git -c user.name="A;B" push origin demo'; E=2 }
        @{ D='psql stdin redirect'; C='PGHOST=db.wkmckfbzhmihyfwiekct.supabase.co psql<example.sql'; E=2 }
        @{ D='psql exe redirect'; C='$env:PGHOST="db.asowsktznpiioaxerlta.supabase.co"; psql.exe>example.log'; E=2 }
    )
    if ($Extended) {
        $targets = @(
            'https://sommercamps-0aod.onrender.com/example',
            'https://wkmckfbzhmihyfwiekct.supabase.co/example',
            'https://asowsktznpiioaxerlta.supabase.co/example',
            'https://campspilot.vercel.app/example'
        )
        $variants = @(
            @{ C='curl -XPOST __TARGET__'; E=2 }
            @{ C='curl -XPUT __TARGET__'; E=2 }
            @{ C='curl -XPATCH __TARGET__'; E=2 }
            @{ C='curl -XDELETE __TARGET__'; E=2 }
            @{ C='curl __TARGET__ --data={}'; E=2 }
            @{ C='curl __TARGET__ --data-binary @example.json'; E=2 }
            @{ C='curl __TARGET__ -d{}'; E=2 }
            @{ C='curl __TARGET__ -F example=value'; E=2 }
            @{ C='curl __TARGET__ --json={}'; E=2 }
            @{ C='Invoke-RestMethod __TARGET__ -Method Delete'; E=2 }
            @{ C='client __TARGET__ "DROP TABLE example"'; E=2 }
            @{ C='psql __TARGET__ -c "SELECT 1"'; E=2 }
            @{ C='curl -X GET __TARGET__'; E=0 }
            @{ C='Invoke-RestMethod __TARGET__ -Method Get'; E=0 }
            @{ C='curl -sSf __TARGET__'; E=0 }
        )
        $index = 0
        foreach ($target in $targets) {
            foreach ($variant in $variants) {
                $tests += @{ D=('extended variant ' + (++$index)); C=$variant.C.Replace('__TARGET__', $target); E=$variant.E }
            }
        }
    }
    if ($BoundarySweep) {
        $executables = @('git', 'git.exe', '"git"', '"C:/Program Files/Git/cmd/git.exe"')
        $globalOptions = @('', '-C "C:/temporary repo" ', '-c user.name="A|B" ', '-c user.name="A;B" ')
        $prefixes = @('', 'git status; ', 'echo "x|y"; ', 'echo example && ')
        $suffixes = @('', '>example.log', ' 2>example.log', ' | Out-Null', '; git status', ' && echo example')
        $index = 0
        foreach ($executable in $executables) {
            foreach ($option in $globalOptions) {
                foreach ($prefix in $prefixes) {
                    foreach ($suffix in $suffixes) {
                        $tests += @{ D=('push boundary ' + (++$index)); C=($prefix + $executable + ' ' + $option + 'push' + $suffix); E=2 }
                    }
                }
            }
        }
        $executables = @('gh', 'gh.exe', '"gh"', '"C:/Program Files/GitHub CLI/gh.exe"')
        $globalOptions = @('', '--repo demo/example ', '--hostname "host.example" ')
        foreach ($executable in $executables) {
            foreach ($option in $globalOptions) {
                foreach ($prefix in $prefixes) {
                    foreach ($suffix in $suffixes) {
                        $tests += @{ D=('merge boundary ' + (++$index)); C=($prefix + $executable + ' ' + $option + 'pr merge' + $suffix); E=2 }
                    }
                }
            }
        }
    }
    $results = @()
    foreach ($tool in @('Bash', 'PowerShell')) {
        foreach ($test in $tests) {
            $payload = @{ tool_name=$tool; tool_input=@{ command=$test.C } } | ConvertTo-Json -Compress -Depth 4
            $result = Test-Guard $GuardScript $payload $test.E
            $results += [PSCustomObject]@{ Tool=$tool; Description=$test.D; Expected=$result.Expected; Actual=$result.Actual; Passed=$result.Passed; Message=$result.Message }
        }
    }
    foreach ($invalid in @('', '{broken', '{}', 'null', '[]', '{"tool_name":"Bash","tool_input":{"command":42}}', '{"tool_name":"Bash","tool_input":{"command":""}}')) {
        $result = Test-Guard $GuardScript $invalid 2
        $results += [PSCustomObject]@{ Tool='invalid'; Description='malformed payload'; Expected=2; Actual=$result.Actual; Passed=$result.Passed; Message=$result.Message }
    }
    # Validate and exercise the registered exec-form command, without evaluating a shell string.
    $root = Split-Path $PSScriptRoot -Parent
    $settings = Get-Content (Join-Path $root '.claude/settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $registration = @($settings.hooks.PreToolUse | Where-Object { $_.matcher -eq 'Bash|PowerShell' })
    if ($registration.Count -ne 1) { throw 'Missing or duplicate shell registration' }
    $handler = $registration[0].hooks[0]
    $expectedArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', '${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-prod.ps1')
    if ($handler.command -ne 'powershell.exe' -or $handler.onFailure -ne 'block' -or
        ($handler.args -join '|') -cne ($expectedArgs -join '|')) { throw 'Invalid hook command configuration' }
    foreach ($rule in @('Bash(git push*)', 'Bash(gh pr merge*)', 'PowerShell(git push*)', 'PowerShell(gh pr merge*)')) {
        if ($settings.permissions.deny -notcontains $rule) { throw "Missing deny rule: $rule" }
    }
    $arguments = ($handler.args | ForEach-Object { '"' + $_.Replace('${CLAUDE_PROJECT_DIR}', $root) + '"' }) -join ' '
    foreach ($expected in @(0, 2)) {
        $command = if ($expected -eq 0) { 'git status' } else { 'git push origin example' }
        $payload = @{ tool_name='Bash'; tool_input=@{ command=$command } } | ConvertTo-Json -Compress -Depth 4
        $result = Test-Guard $GuardScript $payload $expected $handler.command $arguments
        $results += [PSCustomObject]@{ Tool='registered'; Description="registered command exit $expected"; Expected=$expected; Actual=$result.Actual; Passed=$result.Passed; Message=$result.Message }
    }

    # An executable-looking payload must stay inert. A sentinel would expose evaluation.
    $sentinel = Join-Path $root ('guard-sentinel-' + [guid]::NewGuid().ToString('N') + '.txt')
    $payload = @{ tool_name='PowerShell'; tool_input=@{ command="[IO.File]::WriteAllText('$sentinel', 'unexpected')" } } | ConvertTo-Json -Compress -Depth 4
    $result = Test-Guard $GuardScript $payload 0
    $results += [PSCustomObject]@{ Tool='inert'; Description='payload is never executed'; Expected=0; Actual=$result.Actual; Passed=($result.Passed -and -not (Test-Path -LiteralPath $sentinel)); Message=$result.Message }

    # Exercise the SAME comparison with broken hooks. Unexpected codes must fail GET and push.
    $fixture = Join-Path $root ('guard-broken-' + [guid]::NewGuid().ToString('N') + '.ps1')
    try {
        foreach ($brokenCode in @(1, 3)) {
            [IO.File]::WriteAllText($fixture, "exit $brokenCode", [Text.Encoding]::ASCII)
            foreach ($expected in @(0, 2)) {
                $command = if ($expected -eq 0) { 'curl https://campspilot.vercel.app/health' } else { 'git push origin example' }
                $payload = @{ tool_name='Bash'; tool_input=@{ command=$command } } | ConvertTo-Json -Compress -Depth 4
                $result = Test-Guard $fixture $payload $expected
                $results += [PSCustomObject]@{ Tool='harness'; Description="Exit $brokenCode fails expected $expected"; Expected=$expected; Actual=$result.Actual; Passed=($result.Actual -eq $brokenCode -and -not $result.Passed); Message=$result.Message }
            }
        }
    } finally { if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Force } }
    $results | Format-Table Tool, Description, Expected, Actual, Passed -AutoSize | Out-Host
    $failed = @($results | Where-Object { -not $_.Passed }).Count
    Write-Host ("Result: {0}/{1} passed, {2} failures; runtime {3}" -f ($results.Count - $failed), $results.Count, $failed, $PSVersionTable.PSVersion)
    if ($ReportPath) { $results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
    if ($failed -gt 0) { exit 1 }
    exit 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
