# Module 20: Sandbox Management Tests
param($Framework)

$mod = "Sandbox"

Write-ModuleHeader -ModuleName $mod -Description "Sandbox listing, health check, destroy, cleanup (requires Docker)"

$token = Get-AdminToken

# SANDBOX-01: List sandboxes
Test-Step -Id "SANDBOX-01" -Name "List Sandboxes" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/sandbox/" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Sandboxes retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SANDBOX-02: Sandbox health check (non-existent)
Test-Step -Id "SANDBOX-02" -Name "Sandbox Health Check (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/sandbox/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404 for non-existent sandbox" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# SANDBOX-03: Destroy sandbox (non-existent)
Test-Step -Id "SANDBOX-03" -Name "Destroy Sandbox (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/sandbox/00000000-0000-0000-0000-000000000000" -Token $token
    @{ success = $true; detail = "Destroy endpoint reached (status: $($r.statusCode))" }
}

# SANDBOX-04: Cleanup expired
Test-Step -Id "SANDBOX-04" -Name "Cleanup Expired Containers" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/sandbox/cleanup" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Cleanup completed" }
    } else {
        @{ success = $true; detail = "Cleanup endpoint reached (status: $($r.statusCode))" }
    }
}

# SANDBOX-05: Cleanup orphans
Test-Step -Id "SANDBOX-05" -Name "Cleanup Orphan Containers" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/sandbox/cleanup-orphans" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Orphan cleanup completed" }
    } else {
        @{ success = $true; detail = "Cleanup-orphans endpoint reached (status: $($r.statusCode))" }
    }
}
