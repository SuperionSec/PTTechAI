# Module 5: Menu Management Tests
param($Framework)

$mod = "Menus"

Write-ModuleHeader -ModuleName $mod -Description "Menu CRUD, tree structure, user menu"

$token = Get-AdminToken
$createdMenuId = $null

# MENU-01: List all menus
Test-Step -Id "MENU-01" -Name "List All Menus" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/menus" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } else { "?" }
        @{ success = $true; detail = "Menus count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-02: Get menu tree
Test-Step -Id "MENU-02" -Name "Get Menu Tree" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/menus/tree" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Menu tree retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-03: Get user menu
Test-Step -Id "MENU-03" -Name "Get User Menu" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/menus/user" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "User menu retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-04: Create menu
Test-Step -Id "MENU-04" -Name "Create Menu" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/menus" -Token $token -Body (@{
        name       = "Test Menu $(Get-Random -Maximum 9999)"
        path       = "/test-menu-path"
        icon       = "test-icon"
        sort_order = 999
        is_visible = $true
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdMenuId = $r.data.id
        Add-CleanupItem -Type "Menu" -Id $script:createdMenuId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/menus/$($script:createdMenuId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created menu: $($r.data.name)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-05: Get menu detail
Test-Step -Id "MENU-05" -Name "Get Menu Detail" -Module $mod {
    if (-not $script:createdMenuId) { return @{ status = "skip"; detail = "No menu created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/menus/$($script:createdMenuId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Menu: $($r.data.name)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-06: Update menu
Test-Step -Id "MENU-06" -Name "Update Menu" -Module $mod {
    if (-not $script:createdMenuId) { return @{ status = "skip"; detail = "No menu created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/menus/$($script:createdMenuId)" -Token $token -Body (@{
        name = "Updated Test Menu"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Menu updated" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MENU-07: Delete menu
Test-Step -Id "MENU-07" -Name "Delete Menu" -Module $mod {
    if (-not $script:createdMenuId) { return @{ status = "skip"; detail = "No menu created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/menus/$($script:createdMenuId)" -Token $token
    if ($r.success) {
        $script:createdMenuId = $null
        @{ success = $true; detail = "Menu deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
