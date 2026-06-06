# Module 3: User Management Tests
param($Framework)

$mod = "Users"

Write-ModuleHeader -ModuleName $mod -Description "User CRUD, password reset, user listing"

$token = Get-AdminToken
$testUserEmail = "test_crud_user_$(Get-Random -Maximum 99999)@example.com"
$testUserId = $null

# USER-01: Create user
Test-Step -Id "USER-01" -Name "Create User" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/users" -Token $token -Body (@{
        email     = $testUserEmail
        password  = "TestPass123!"
        full_name = "CRUD Test User"
        role      = "user"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:testUserId = $r.data.id
        Add-CleanupItem -Type "User" -Id $script:testUserId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/users/$($script:testUserId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created user: $testUserEmail (id=$($script:testUserId))" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-02: Get current user info
Test-Step -Id "USER-02" -Name "Get Current User (GET /users/me)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/users/me" -Token $token
    if ($r.success -and $r.data.email) {
        @{ success = $true; detail = "Current user: $($r.data.email)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-03: List users
Test-Step -Id "USER-03" -Name "List Users" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/users" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } elseif ($r.data.total) { $r.data.total } else { "?" }
        @{ success = $true; detail = "Users count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-04: Get user by ID
Test-Step -Id "USER-04" -Name "Get User By ID" -Module $mod {
    if (-not $script:testUserId) { return @{ status = "skip"; detail = "No test user created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/users/$($script:testUserId)" -Token $token
    if ($r.success -and $r.data.email -eq $testUserEmail) {
        @{ success = $true; detail = "User found: $($r.data.email)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-05: Update user
Test-Step -Id "USER-05" -Name "Update User" -Module $mod {
    if (-not $script:testUserId) { return @{ status = "skip"; detail = "No test user created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/system/users/$($script:testUserId)" -Token $token -Body (@{
        full_name = "Updated Test User"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Updated user full_name" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-06: Reset password
Test-Step -Id "USER-06" -Name "Reset User Password" -Module $mod {
    if (-not $script:testUserId) { return @{ status = "skip"; detail = "No test user created" } }
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/users/$($script:testUserId)/reset-password" -Token $token -Body (@{
        new_password = "NewPass456!"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Password reset successful" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# USER-07: Delete user
Test-Step -Id "USER-07" -Name "Delete User" -Module $mod {
    if (-not $script:testUserId) { return @{ status = "skip"; detail = "No test user created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/users/$($script:testUserId)" -Token $token
    if ($r.success) {
        $script:testUserId = $null
        @{ success = $true; detail = "User deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
