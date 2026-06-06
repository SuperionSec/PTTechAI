# Module 6: Audit Log Tests
param($Framework)

$mod = "Audit"

Write-ModuleHeader -ModuleName $mod -Description "Audit log listing and filtering"

$token = Get-AdminToken

# AUDIT-01: List audit logs
Test-Step -Id "AUDIT-01" -Name "List Audit Logs" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/audit" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } elseif ($r.data.total -ne $null) { $r.data.total } else { "?" }
        @{ success = $true; detail = "Audit logs count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AUDIT-02: Filter by action type
Test-Step -Id "AUDIT-02" -Name "Filter Audit Logs by Action" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/audit" -Token $token -QueryParams @{ action = "login" }
    if ($r.success) {
        @{ success = $true; detail = "Filtered by action=login" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AUDIT-03: Filter by resource type
Test-Step -Id "AUDIT-03" -Name "Filter Audit Logs by Resource Type" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/audit" -Token $token -QueryParams @{ resource_type = "user" }
    if ($r.success) {
        @{ success = $true; detail = "Filtered by resource_type=user" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
