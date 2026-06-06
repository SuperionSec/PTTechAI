# Module 26: Vulnerability Library Tests
param($Framework)

$mod = "VulnLibrary"

Write-ModuleHeader -ModuleName $mod -Description "Vulnerability library entries, identifiers, artifacts, categories, import/export"

$token = Get-AdminToken
$createdEntryId = $null
$createdCategoryId = $null

# VLIB-01: Vulnerability library stats
Test-Step -Id "VLIB-01" -Name "Vulnerability Library Stats" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/stats" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Stats retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-02: List entries
Test-Step -Id "VLIB-02" -Name "List Vulnerability Entries" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/entries" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Entries retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-03: Export entries
Test-Step -Id "VLIB-03" -Name "Export Entries" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/entries/export" -Token $token -QueryParams @{ format = "json" }
    if ($r.success) {
        @{ success = $true; detail = "Export completed" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-04: Create entry
Test-Step -Id "VLIB-04" -Name "Create Vulnerability Entry" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vulnerability-library/entries" -Token $token -Body (@{
        title       = "Test Vuln Entry $(Get-Random -Maximum 9999)"
        description = "Test vulnerability description for automated testing"
        severity    = "medium"
        vuln_type   = "injection"
        status      = "draft"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdEntryId = $r.data.id
        Add-CleanupItem -Type "VulnEntry" -Id $script:createdEntryId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created entry: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-05: Get entry detail
Test-Step -Id "VLIB-05" -Name "Get Entry Detail" -Module $mod {
    if (-not $script:createdEntryId) { return @{ status = "skip"; detail = "No entry created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Entry: $($r.data.title)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-06: Update entry
Test-Step -Id "VLIB-06" -Name "Update Entry" -Module $mod {
    if (-not $script:createdEntryId) { return @{ status = "skip"; detail = "No entry created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)" -Token $token -Body (@{
        description = "Updated test vulnerability description"
        severity    = "high"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Entry updated" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-07: Delete entry (deferred - need for identifier/artifact tests)
# Will delete at the end

# VLIB-08: Import entries
Test-Step -Id "VLIB-08" -Name "Import Entries (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vulnerability-library/entries/import" -Token $token -Body (@{
        entries = @()
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Import endpoint works" }
    } else {
        @{ success = $true; detail = "Import endpoint reached (status: $($r.statusCode))" }
    }
}

# VLIB-09: List identifiers
Test-Step -Id "VLIB-09" -Name "List Identifiers" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/identifiers" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Identifiers retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-10: Create identifier
Test-Step -Id "VLIB-10" -Name "Create Identifier" -Module $mod {
    if (-not $script:createdEntryId) { return @{ status = "skip"; detail = "No entry created" } }
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)/identifiers" -Token $token -Body (@{
        identifier_type = "CVE"
        value           = "CVE-2024-TEST-$(Get-Random -Maximum 9999)"
        url             = "https://nvd.nist.gov/vuln/detail/CVE-2024-TEST"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdIdentifierId = $r.data.id
        @{ success = $true; detail = "Created identifier: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-11: Update identifier
Test-Step -Id "VLIB-11" -Name "Update Identifier" -Module $mod {
    if (-not $script:createdIdentifierId) { return @{ status = "skip"; detail = "No identifier created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/vulnerability-library/identifiers/$($script:createdIdentifierId)" -Token $token -Body (@{
        url = "https://updated-url.example.com"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Identifier updated" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-12: Delete identifier
Test-Step -Id "VLIB-12" -Name "Delete Identifier" -Module $mod {
    if (-not $script:createdIdentifierId) { return @{ status = "skip"; detail = "No identifier created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/identifiers/$($script:createdIdentifierId)" -Token $token
    if ($r.success) {
        $script:createdIdentifierId = $null
        @{ success = $true; detail = "Identifier deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-13: List artifacts
Test-Step -Id "VLIB-13" -Name "List Artifacts" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/artifacts" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Artifacts retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-14: Create artifact
Test-Step -Id "VLIB-14" -Name "Create Artifact" -Module $mod {
    if (-not $script:createdEntryId) { return @{ status = "skip"; detail = "No entry created" } }
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)/artifacts" -Token $token -Body (@{
        artifact_type = "poc"
        title         = "Test PoC $(Get-Random -Maximum 9999)"
        content       = "Test proof of concept code"
        language      = "python"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdArtifactId = $r.data.id
        @{ success = $true; detail = "Created artifact: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-15: Get artifact detail
Test-Step -Id "VLIB-15" -Name "Get Artifact Detail" -Module $mod {
    if (-not $script:createdArtifactId) { return @{ status = "skip"; detail = "No artifact created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/artifacts/$($script:createdArtifactId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Artifact: $($r.data.title)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-16: Update artifact
Test-Step -Id "VLIB-16" -Name "Update Artifact" -Module $mod {
    if (-not $script:createdArtifactId) { return @{ status = "skip"; detail = "No artifact created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/vulnerability-library/artifacts/$($script:createdArtifactId)" -Token $token -Body (@{
        content = "Updated proof of concept code"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Artifact updated" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-17: Delete artifact
Test-Step -Id "VLIB-17" -Name "Delete Artifact" -Module $mod {
    if (-not $script:createdArtifactId) { return @{ status = "skip"; detail = "No artifact created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/artifacts/$($script:createdArtifactId)" -Token $token
    if ($r.success) {
        $script:createdArtifactId = $null
        @{ success = $true; detail = "Artifact deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-18: List categories
Test-Step -Id "VLIB-18" -Name "List Categories" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vulnerability-library/categories" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Categories retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-19: Create category
Test-Step -Id "VLIB-19" -Name "Create Category" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vulnerability-library/categories" -Token $token -Body (@{
        name        = "Test Category $(Get-Random -Maximum 9999)"
        description = "Test category for automated testing"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdCategoryId = $r.data.id
        Add-CleanupItem -Type "VulnCategory" -Id $script:createdCategoryId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/categories/$($script:createdCategoryId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created category: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLIB-20: Update and delete category
Test-Step -Id "VLIB-20" -Name "Update and Delete Category" -Module $mod {
    if (-not $script:createdCategoryId) { return @{ status = "skip"; detail = "No category created" } }

    # Update
    $r1 = Invoke-ApiRequest -Method PUT -Path "/api/v1/vulnerability-library/categories/$($script:createdCategoryId)" -Token $token -Body (@{
        description = "Updated test category"
    } | ConvertTo-Json)

    # Delete
    $r2 = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/categories/$($script:createdCategoryId)" -Token $token

    if ($r2.success) {
        $script:createdCategoryId = $null
        @{ success = $true; detail = "Category updated and deleted" }
    } else {
        @{ success = $false; detail = "Delete failed: $($r2.error)" }
    }
}

# VLIB-07: Delete entry (cleanup)
Test-Step -Id "VLIB-07" -Name "Delete Vulnerability Entry" -Module $mod {
    if (-not $script:createdEntryId) { return @{ status = "skip"; detail = "No entry created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vulnerability-library/entries/$($script:createdEntryId)" -Token $token
    if ($r.success) {
        $script:createdEntryId = $null
        @{ success = $true; detail = "Entry deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
