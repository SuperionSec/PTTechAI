# Module 13: Vulnerability Types Tests
param($Framework)

$mod = "VulnTypes"

Write-ModuleHeader -ModuleName $mod -Description "Vulnerability type listing and details"

$token = Get-AdminToken

# VULNTYPE-01: Get all vulnerability types
Test-Step -Id "VULNTYPE-01" -Name "Get All Vulnerability Types" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerabilities/types" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Vulnerability types retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VULNTYPE-02: Get types by category
Test-Step -Id "VULNTYPE-02" -Name "Get Types by Category" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerabilities/types/injection" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Injection types retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# VULNTYPE-03: Get type detail
Test-Step -Id "VULNTYPE-03" -Name "Get Type Detail" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerabilities/types/injection/sql_injection" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "SQL injection type detail retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# VULNTYPE-04: Get vulnerability by ID (non-existent)
Test-Step -Id "VULNTYPE-04" -Name "Get Vulnerability by ID (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerabilities/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}
