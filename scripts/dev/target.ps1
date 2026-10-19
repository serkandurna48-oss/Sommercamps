function Test-DevLoopback {
    param([Uri]$Url)
    if ($Url.DnsSafeHost -eq 'localhost') { return $true }
    $address = $null
    if ([Net.IPAddress]::TryParse($Url.DnsSafeHost.Trim('[',']'), [ref]$address)) {
        return $address.Equals([Net.IPAddress]::Loopback) -or $address.Equals([Net.IPAddress]::IPv6Loopback)
    }
    return $false
}

function Get-DevTarget {
    param([string]$DatabaseUrl, [string]$ApiUrl)
    $db = $null; $api = $null
    if (-not [Uri]::TryCreate($DatabaseUrl, [UriKind]::Absolute, [ref]$db) -or
        $db.Scheme -notin @('postgresql', 'postgres') -or -not $db.Host -or
        $db.AbsolutePath -in @('', '/') -or $db.Fragment -or $DatabaseUrl -match '\s') { throw 'Invalid database URL' }
    if (-not [Uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$api) -or
        $api.Scheme -notin @('http', 'https') -or -not $api.Host -or $api.UserInfo -or $api.Fragment -or $api.Query -or $ApiUrl -match '\s') { throw 'Invalid API URL' }
    $decoded = [Uri]::UnescapeDataString("$DatabaseUrl $ApiUrl").ToLowerInvariant()
    $production = $decoded -match 'sommercamps-0aod|wkmckfbzhmihyfwiekct|asowsktznpiioaxerlta|campspilot\.vercel\.app|(^|[^a-z])prod(uction)?([^a-z]|$)'
    $name = 'PROD'
    if (-not $production) {
        $dbLocal = Test-DevLoopback $db; $apiLocal = Test-DevLoopback $api
        $dbStage = $db.Host -match '(^|[.\-])stag(e|ing)([.\-]|$)'
        $apiStage = $api.Host -match '(^|[.\-])stag(e|ing)([.\-]|$)'
        if ($dbLocal -and $apiLocal) { $name = 'LOCAL' }
        elseif (($dbLocal -or $dbStage) -and ($apiLocal -or $apiStage)) { $name = 'STAGING' }
    }
    return @{Name=$name; Db=$db; Api=$api}
}
