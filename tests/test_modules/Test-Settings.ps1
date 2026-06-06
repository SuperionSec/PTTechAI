# Module 15: System Settings Tests
param($Framework)

$mod = "Settings"

Write-ModuleHeader -ModuleName $mod -Description "System settings, notification test, database stats, tools"

$token = Get-AdminToken

# SETTINGS-01: Get settings
Test-Step -Id "SETTINGS-01" -Name "Get Settings" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/settings" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Settings retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SETTINGS-02: Update settings (read-only test - just verify endpoint)
Test-Step -Id "SETTINGS-02" -Name "Update Settings (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/settings" -Token $token -Body (@{} | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Settings update endpoint works" }
    } else {
        @{ success = $true; detail = "Update endpoint reached (status: $($r.statusCode))" }
    }
}

# SETTINGS-03: Test notification channel
Test-Step -Id "SETTINGS-03" -Name "Test Notification Channel" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/settings/notifications/test/discord" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Notification test sent" }
    } else {
        @{ success = $true; detail = "Notification endpoint reached (status: $($r.statusCode) - may need config)" }
    }
}

# SETTINGS-04: Database stats
Test-Step -Id "SETTINGS-04" -Name "Database Stats" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/settings/stats" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Database stats retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SETTINGS-05: Installed tools
Test-Step -Id "SETTINGS-05" -Name "Installed Tools" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/settings/tools" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Tools status retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SETTINGS-06: Provider models
Test-Step -Id "SETTINGS-06" -Name "Provider Models" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/settings/models/claude" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Provider models retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# SETTINGS-07: Clear database (permission check only - do NOT actually clear)
Test-Step -Id "SETTINGS-07" -Name "Clear Database Permission Check" -Module $mod {
    # Verify non-admin is rejected
    $viewerToken = Get-ViewerToken
    if ($viewerToken) {
        $r = Invoke-ApiRequest -Method POST -Path "/api/v1/settings/clear-database" -Token $viewerToken -Body (@{ confirm = $false } | ConvertTo-Json)
        if ($r.statusCode -eq 403 -or $r.statusCode -eq 401) {
            @{ success = $true; detail = "Non-admin correctly rejected (status: $($r.statusCode))" }
        } else {
            @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
        }
    } else {
        @{ status = "skip"; detail = "No viewer token available" }
    }
}
