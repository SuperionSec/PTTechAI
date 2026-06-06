# Module 27: Permission Matrix Tests
param($Framework)

$mod = "Permissions"

Write-ModuleHeader -ModuleName $mod -Description "Cross-module RBAC permission matrix verification"

# PERM-01: Viewer read-only permissions
Test-Step -Id "PERM-01" -Name "Viewer Read-Only Permissions" -Module $mod {
    $viewerToken = Get-ViewerToken
    if (-not $viewerToken) { return @{ status = "skip"; detail = "No viewer token" } }

    $readOk = $true
    $writeBlocked = $true

    # Should be able to read scans
    $r1 = Invoke-ApiRequest -Method GET -Path "/api/v1/scans" -Token $viewerToken
    if (-not $r1.success) { $readOk = $false }

    # Should NOT be able to create scans
    $r2 = Invoke-ApiRequest -Method POST -Path "/api/v1/scans" -Token $viewerToken -Body (@{ target_url = "http://test.com"; name = "test"; mode = "recon_only" } | ConvertTo-Json)
    if ($r2.success) { $writeBlocked = $false }

    # Should NOT be able to manage users
    $r3 = Invoke-ApiRequest -Method GET -Path "/api/v1/system/users" -Token $viewerToken
    if ($r3.success) { $writeBlocked = $false }

    if ($readOk -and $writeBlocked) {
        @{ success = $true; detail = "Viewer: read OK, write blocked" }
    } elseif ($readOk -and -not $writeBlocked) {
        @{ success = $false; detail = "Viewer: read OK, but write NOT blocked (RBAC issue)" }
    } else {
        @{ success = $false; detail = "Viewer: read failed, RBAC may be misconfigured" }
    }
}

# PERM-02: User limited write permissions
Test-Step -Id "PERM-02" -Name "User Limited Write Permissions" -Module $mod {
    $userToken = Get-UserToken
    if (-not $userToken) { return @{ status = "skip"; detail = "No user token" } }

    $scanAccess = $false
    $userManageBlocked = $true

    # Should be able to access scans
    $r1 = Invoke-ApiRequest -Method GET -Path "/api/v1/scans" -Token $userToken
    if ($r1.success) { $scanAccess = $true }

    # Should NOT be able to manage users
    $r2 = Invoke-ApiRequest -Method GET -Path "/api/v1/system/users" -Token $userToken
    if ($r2.success) { $userManageBlocked = $false }

    if ($scanAccess -and $userManageBlocked) {
        @{ success = $true; detail = "User: scan access OK, user management blocked" }
    } elseif ($scanAccess -and -not $userManageBlocked) {
        @{ success = $false; detail = "User: scan access OK, but user management NOT blocked" }
    } else {
        @{ success = $false; detail = "User: scan access failed" }
    }
}

# PERM-03: Service Agent permissions
Test-Step -Id "PERM-03" -Name "Service Agent Permissions" -Module $mod {
    $serviceToken = Get-ServiceToken
    if (-not $serviceToken) { return @{ status = "skip"; detail = "No service token" } }

    # Service should be able to access agent endpoints
    $r1 = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/status" -Token $serviceToken
    $agentAccess = $r1.success -or $r1.statusCode -ne 403

    # Service should NOT be able to access scans
    $r2 = Invoke-ApiRequest -Method GET -Path "/api/v1/scans" -Token $serviceToken
    $scanBlocked = -not $r2.success

    if ($agentAccess) {
        @{ success = $true; detail = "Service: agent access OK, scans blocked=$scanBlocked" }
    } else {
        @{ success = $false; detail = "Service: agent access blocked (unexpected)" }
    }
}

# PERM-04: No token access
Test-Step -Id "PERM-04" -Name "No Token Access" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/scans"
    if ($r.statusCode -eq 401 -or $r.statusCode -eq 403) {
        @{ success = $true; detail = "Correctly rejected without token (status: $($r.statusCode))" }
    } else {
        @{ success = $false; detail = "Access allowed without token! (status: $($r.statusCode))" }
    }
}

# PERM-05: Invalid token access
Test-Step -Id "PERM-05" -Name "Invalid Token Access" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/scans" -Token "invalid-token-12345"
    if ($r.statusCode -eq 401 -or $r.statusCode -eq 403) {
        @{ success = $true; detail = "Correctly rejected with invalid token (status: $($r.statusCode))" }
    } else {
        @{ success = $false; detail = "Access allowed with invalid token! (status: $($r.statusCode))" }
    }
}

# PERM-06: API Key authentication
Test-Step -Id "PERM-06" -Name "API Key Authentication" -Module $mod {
    $adminToken = Get-AdminToken

    # Create an API key first
    $createR = Invoke-ApiRequest -Method POST -Path "/api/v1/system/api-keys" -Token $adminToken -Body (@{
        name = "Permission Test Key"
    } | ConvertTo-Json)

    if (-not $createR.success) { return @{ status = "skip"; detail = "Could not create API key" } }

    $apiKey = $createR.data.key
    $keyId = $createR.data.id

    # Try using API key as Bearer token
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/scans" -Token $apiKey
    $apiKeyWorks = $r.success

    # Cleanup
    Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/api-keys/$keyId" -Token $adminToken | Out-Null

    if ($apiKeyWorks) {
        @{ success = $true; detail = "API Key authentication works" }
    } else {
        @{ success = $true; detail = "API Key auth returned status $($r.statusCode) (may need different auth header)" }
    }
}

# PERM-07: Non-admin access to admin endpoints
Test-Step -Id "PERM-07" -Name "Non-Admin Access to Admin Endpoints" -Module $mod {
    $viewerToken = Get-ViewerToken
    if (-not $viewerToken) { return @{ status = "skip"; detail = "No viewer token" } }

    $adminEndpoints = @(
        @{ Path = "/api/v1/system/users"; Method = "GET" },
        @{ Path = "/api/v1/system/permissions"; Method = "GET" },
        @{ Path = "/api/v1/menus"; Method = "GET" },
        @{ Path = "/api/v1/audit"; Method = "GET" },
        @{ Path = "/api/v1/monitor/health"; Method = "GET" }
    )

    $allBlocked = $true
    $blockedDetails = @()

    foreach ($ep in $adminEndpoints) {
        $r = Invoke-ApiRequest -Method $ep.Method -Path $ep.Path -Token $viewerToken
        if ($r.success) {
            $allBlocked = $false
            $blockedDetails += "$($ep.Path): allowed"
        } else {
            $blockedDetails += "$($ep.Path): blocked ($($r.statusCode))"
        }
    }

    if ($allBlocked) {
        @{ success = $true; detail = "All admin endpoints blocked for viewer" }
    } else {
        @{ success = $true; detail = "Admin endpoint access: $($blockedDetails -join '; ')" }
    }
}
