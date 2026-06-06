# Module 2: RBAC Permission Management Tests
param($Framework)

$mod = "RBAC"

Write-ModuleHeader -ModuleName $mod -Description "Role-Based Access Control: roles, permissions, resource mappings"

$token = Get-AdminToken
$testRoleName = "test_role_$(Get-Random -Maximum 9999)"

# RBAC-01: Get current user RBAC profile
Test-Step -Id "RBAC-01" -Name "Get My RBAC Profile" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/me" -Token $token
    if ($r.success -and $r.data.role) {
        @{ success = $true; detail = "Role: $($r.data.role), Permissions: $($r.data.permissions.Count), Pages: $($r.data.frontend_pages.Count)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-02: List all permissions
Test-Step -Id "RBAC-02" -Name "List All Permissions" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/permissions" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } else { "?" }
        @{ success = $true; detail = "Permissions count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-03: List all roles
Test-Step -Id "RBAC-03" -Name "List All Roles" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/roles" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } else { "?" }
        @{ success = $true; detail = "Roles count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-04: Create role
Test-Step -Id "RBAC-04" -Name "Create Role" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/roles" -Token $token -Body (@{
        name         = $testRoleName
        display_name = "Test Role"
        description  = "Test role for automated testing"
    } | ConvertTo-Json)
    if ($r.success) {
        Add-CleanupItem -Type "Role" -Id $testRoleName -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/roles/$testRoleName" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created role: $testRoleName" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-05: Get role detail
Test-Step -Id "RBAC-05" -Name "Get Role Detail" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/roles/$testRoleName" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Role: $($r.data.role), Description: $($r.data.description)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-06: Update role
Test-Step -Id "RBAC-06" -Name "Update Role" -Module $mod {
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/system/roles/$testRoleName" -Token $token -Body (@{
        description = "Updated test role description"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Updated role description" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-07: Update role permissions
Test-Step -Id "RBAC-07" -Name "Update Role Permissions" -Module $mod {
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/system/roles/$testRoleName/permissions" -Token $token -Body (@{
        permission_ids = @()
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Updated role permissions (empty set)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-08: Delete role
Test-Step -Id "RBAC-08" -Name "Delete Role" -Module $mod {
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/roles/$testRoleName" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Deleted role: $testRoleName" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-09: List resource mappings
Test-Step -Id "RBAC-09" -Name "List Resource Mappings" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/resources" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Resource mappings retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-10: Create resource mapping
Test-Step -Id "RBAC-10" -Name "Create Resource Mapping" -Module $mod {
    # First get a permission ID
    $permR = Invoke-ApiRequest -Method GET -Path "/api/v1/system/permissions" -Token $token
    $permId = $null
    if ($permR.success) {
        $perms = if ($permR.data -is [array]) { $permR.data } elseif ($permR.data.items) { $permR.data.items } else { @() }
        if ($perms.Count -gt 0) { $permId = $perms[0].id }
    }
    if (-not $permId) { return @{ status = "skip"; detail = "No permission available for mapping test" } }

    $mappingId = "test-map-$(Get-Random -Maximum 9999)"
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/resources/mappings" -Token $token -Body (@{
        id             = $mappingId
        permission_id  = $permId
        resource_type  = "frontend_page"
        resource_path  = "/test-mapping-page"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdMappingId = $mappingId
        Add-CleanupItem -Type "Mapping" -Id $mappingId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/resources/mappings/$mappingId" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created mapping: $mappingId" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-11: Delete resource mapping
Test-Step -Id "RBAC-11" -Name "Delete Resource Mapping" -Module $mod {
    if (-not $script:createdMappingId) { return @{ status = "skip"; detail = "No mapping created in previous step" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/resources/mappings/$($script:createdMappingId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Deleted mapping: $($script:createdMappingId)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# RBAC-12: List unmapped resources
Test-Step -Id "RBAC-12" -Name "List Unmapped Resources" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/resources/unmapped" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Unmapped resources retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
