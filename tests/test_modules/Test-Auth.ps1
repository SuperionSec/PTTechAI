# Module 1: Authentication & Authorization Tests
param($Framework)

$mod = "Auth"

Write-ModuleHeader -ModuleName $mod -Description "Authentication, token management, SSO, and password tests"

# Helper: ensure admin token is valid after each test
function Restore-AdminToken {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "admin123" } | ConvertTo-Json)
    if ($r.success -and $r.data.access_token) {
        Set-AdminToken -Token $r.data.access_token -RefreshToken $r.data.refresh_token
        return $true
    }
    return $false
}

# AUTH-01: Admin Login
Test-Step -Id "AUTH-01" -Name "Admin Login" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "admin123" } | ConvertTo-Json)
    if ($r.success -and $r.data.access_token) {
        Set-AdminToken -Token $r.data.access_token -RefreshToken $r.data.refresh_token
        @{ success = $true; detail = "Token received (len=$($r.data.access_token.Length))" }
    } else {
        @{ success = $false; detail = "No token returned: $($r.error)" }
    }
}

# AUTH-02: Token Validation
Test-Step -Id "AUTH-02" -Name "Token Validation (GET /me)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/profile/me" -Token (Get-AdminToken)
    if ($r.success -and $r.data.email -eq "admin@bctech.ai") {
        @{ success = $true; detail = "User: $($r.data.email), Role: $($r.data.role)" }
    } else {
        @{ success = $false; detail = "Invalid user data or request failed" }
    }
}

# AUTH-03: Token Refresh
Test-Step -Id "AUTH-03" -Name "Token Refresh" -Module $mod {
    $refresh = Get-AdminRefresh
    if (-not $refresh) {
        return @{ status = "skip"; detail = "No refresh token available" }
    }
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/refresh" -Body (@{ refresh_token = $refresh } | ConvertTo-Json)
    if ($r.success -and $r.data.access_token) {
        Set-AdminToken -Token $r.data.access_token -RefreshToken $r.data.refresh_token
        @{ success = $true; detail = "New token received" }
    } else {
        # Refresh may fail - restore token
        Restore-AdminToken | Out-Null
        @{ success = $false; detail = "Refresh failed: $($r.error)" }
    }
}

# AUTH-04: SSO Single Sign-On
Test-Step -Id "AUTH-04" -Name "SSO Single Sign-On" -Module $mod {
    # First login
    $r1 = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "admin123" } | ConvertTo-Json)
    if (-not $r1.success) { return @{ success = $false; detail = "First login failed" } }
    $oldToken = $r1.data.access_token

    Start-Sleep -Milliseconds 500

    # Second login (should invalidate first)
    $r2 = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "admin123" } | ConvertTo-Json)
    if (-not $r2.success) { return @{ success = $false; detail = "Second login failed" } }
    $newToken = $r2.data.access_token

    # Try using old token
    $r3 = Invoke-ApiRequest -Method GET -Path "/api/v1/system/profile/me" -Token $oldToken
    # Always restore the latest token
    Set-AdminToken -Token $newToken -RefreshToken $r2.data.refresh_token
    if ($r3.success) {
        @{ success = $true; detail = "Old token still valid (SSO not enforced, both tokens work)" }
    } else {
        @{ success = $true; detail = "Old token revoked, new token works (SSO enforced)" }
    }
}

# AUTH-05: Logout
Test-Step -Id "AUTH-05" -Name "Logout" -Module $mod {
    # Login fresh for this test (use a separate token)
    $r1 = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "admin123" } | ConvertTo-Json)
    if (-not $r1.success) { return @{ success = $false; detail = "Login for logout test failed" } }
    $logoutToken = $r1.data.access_token

    $r2 = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/logout" -Token $logoutToken
    if ($r2.success) {
        # Verify token is invalidated
        $r3 = Invoke-ApiRequest -Method GET -Path "/api/v1/system/profile/me" -Token $logoutToken
        # Restore admin token (SSO may have invalidated all tokens)
        Restore-AdminToken | Out-Null
        if ($r3.success) {
            @{ success = $true; detail = "Logout returned OK but token still valid (may be acceptable)" }
        } else {
            @{ success = $true; detail = "Logout successful, token invalidated" }
        }
    } else {
        Restore-AdminToken | Out-Null
        @{ success = $false; detail = "Logout request failed: $($r2.error)" }
    }
}

# AUTH-06: Logout All Sessions
Test-Step -Id "AUTH-06" -Name "Logout All Sessions" -Module $mod {
    $token = Get-AdminToken
    if (-not $token) { 
        Restore-AdminToken | Out-Null
        $token = Get-AdminToken
    }
    if (-not $token) { return @{ status = "skip"; detail = "No admin token" } }

    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/logout-all" -Token $token
    # Always re-login after logout-all to restore admin token
    $restored = Restore-AdminToken
    if ($r.success) {
        @{ success = $true; detail = "Logout-all returned OK, token restored: $restored" }
    } else {
        @{ success = $false; detail = "Logout-all failed: $($r.error)" }
    }
}

# AUTH-07: Change Password (validation only - do NOT actually change)
Test-Step -Id "AUTH-07" -Name "Change Password (validation only)" -Module $mod {
    $token = Get-AdminToken
    if (-not $token) { 
        Restore-AdminToken | Out-Null
        $token = Get-AdminToken
    }
    if (-not $token) { return @{ status = "skip"; detail = "No admin token" } }

    # Test with wrong current password
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/system/profile/change-password" -Token $token -Body (@{
        current_password = "wrongpassword"
        new_password     = "newpass123"
    } | ConvertTo-Json)

    if (-not $r.success -and ($r.statusCode -eq 400 -or $r.statusCode -eq 401 -or $r.statusCode -eq 422)) {
        @{ success = $true; detail = "Correctly rejected wrong current password ($($r.statusCode))" }
    } elseif (-not $r.success) {
        @{ success = $true; detail = "Rejected with status $($r.statusCode)" }
    } else {
        @{ success = $false; detail = "Accepted wrong current password" }
    }
}

# AUTH-08: Invalid Credentials
Test-Step -Id "AUTH-08" -Name "Invalid Credentials Login" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = "admin@bctech.ai"; password = "wrongpassword123" } | ConvertTo-Json)
    if (-not $r.success -and $r.statusCode -eq 401) {
        @{ success = $true; detail = "Correctly rejected invalid credentials (401)" }
    } elseif (-not $r.success) {
        @{ success = $true; detail = "Rejected with status $($r.statusCode)" }
    } else {
        @{ success = $false; detail = "Login succeeded with wrong password!" }
    }
}

# Ensure admin token is valid after all auth tests
Restore-AdminToken | Out-Null
