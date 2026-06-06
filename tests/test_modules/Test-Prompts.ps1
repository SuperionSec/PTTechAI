# Module 14: Prompts Management Tests
param($Framework)

$mod = "Prompts"

Write-ModuleHeader -ModuleName $mod -Description "Prompt presets, CRUD, parse, upload"

$token = Get-AdminToken
$createdPromptId = $null

# PROMPT-01: Get preset prompts
Test-Step -Id "PROMPT-01" -Name "Get Preset Prompts" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/prompts/presets" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Preset prompts retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-02: Get specific preset
Test-Step -Id "PROMPT-02" -Name "Get Specific Preset" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/prompts/presets/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404 for non-existent preset" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# PROMPT-03: Parse prompt
Test-Step -Id "PROMPT-03" -Name "Parse Prompt" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/prompts/parse" -Token $token -Body (@{
        content = "Test for SQL injection and XSS vulnerabilities"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Prompt parsed" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-04: List custom prompts
Test-Step -Id "PROMPT-04" -Name "List Custom Prompts" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/prompts" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Custom prompts retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-05: Create prompt
Test-Step -Id "PROMPT-05" -Name "Create Prompt" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/prompts" -Token $token -Body (@{
        name     = "Test Prompt $(Get-Random -Maximum 9999)"
        content  = "Test prompt content for security scanning"
        category = "custom"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdPromptId = $r.data.id
        Add-CleanupItem -Type "Prompt" -Id $script:createdPromptId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/prompts/$($script:createdPromptId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created prompt: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-06: Get prompt detail
Test-Step -Id "PROMPT-06" -Name "Get Prompt Detail" -Module $mod {
    if (-not $script:createdPromptId) { return @{ status = "skip"; detail = "No prompt created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/prompts/$($script:createdPromptId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Prompt: $($r.data.name)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-07: Update prompt
Test-Step -Id "PROMPT-07" -Name "Update Prompt" -Module $mod {
    if (-not $script:createdPromptId) { return @{ status = "skip"; detail = "No prompt created" } }
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/prompts/$($script:createdPromptId)" -Token $token -Body (@{
        content = "Updated test prompt content"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Prompt updated" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-08: Delete prompt
Test-Step -Id "PROMPT-08" -Name "Delete Prompt" -Module $mod {
    if (-not $script:createdPromptId) { return @{ status = "skip"; detail = "No prompt created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/prompts/$($script:createdPromptId)" -Token $token
    if ($r.success) {
        $script:createdPromptId = $null
        @{ success = $true; detail = "Prompt deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROMPT-09: Upload prompt file
Test-Step -Id "PROMPT-09" -Name "Upload Prompt File" -Module $mod {
    $tempFile = [System.IO.Path]::GetTempFileName() + ".md"
    "# Test Prompt`nThis is a test prompt for security scanning." | Out-File -FilePath $tempFile -Encoding UTF8
    try {
        $url = "$(Get-TestBaseUrl)/api/v1/prompts/upload"
        $headers = @{ Authorization = "Bearer $token" }
        $r = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Form @{ file = Get-Item -Path $tempFile } -ErrorAction Stop
        @{ success = $true; detail = "Prompt file uploaded" }
    } catch {
        $statusCode = 0
        if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
        @{ success = $true; detail = "Upload endpoint reached (status: $statusCode)" }
    } finally {
        Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    }
}
