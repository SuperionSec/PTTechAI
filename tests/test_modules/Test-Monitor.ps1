# Module 7: System Monitor Tests
param($Framework)

$mod = "Monitor"

Write-ModuleHeader -ModuleName $mod -Description "System health check and database status"

$token = Get-AdminToken

# MONITOR-01: System health
Test-Step -Id "MONITOR-01" -Name "System Health Check" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/monitor/health" -Token $token
    if ($r.success) {
        $ver = if ($r.data.version) { $r.data.version } else { "N/A" }
        @{ success = $true; detail = "System healthy, version: $ver" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MONITOR-02: Database status
Test-Step -Id "MONITOR-02" -Name "Database Status" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/monitor/database" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Database status retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
