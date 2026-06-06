# Module 4: API Key Management Tests
param($Framework)

$mod = "ApiKeys"

Write-ModuleHeader -ModuleName $mod -Description "API Key creation, listing, and deletion"

$token = Get-AdminToken
$createdKeyId = $null

# APIKEY-01: Create API Key
Test-Step -Id "APIKEY-01" -Name "Create API Key" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/system/api-keys" -Token $token -Body (@{
        name = "Test API Key $(Get-Random -Maximum 9999)"
    } | ConvertTo-Json)
    if ($r.success -and $r.data.key) {
        $script:createdKeyId = $r.data.id
        $script:createdKeyValue = $r.data.key
        Add-CleanupItem -Type "ApiKey" -Id $script:createdKeyId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/api-keys/$($script:createdKeyId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created API Key: $($r.data.name)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# APIKEY-02: List API Keys
Test-Step -Id "APIKEY-02" -Name "List API Keys" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/system/api-keys" -Token $token
    if ($r.success) {
        $count = if ($r.data -is [array]) { $r.data.Count } elseif ($r.data.items) { $r.data.items.Count } else { "?" }
        @{ success = $true; detail = "API Keys count: $count" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# APIKEY-03: Delete API Key
Test-Step -Id "APIKEY-03" -Name "Delete API Key" -Module $mod {
    if (-not $script:createdKeyId) { return @{ status = "skip"; detail = "No API key created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/system/api-keys/$($script:createdKeyId)" -Token $token
    if ($r.success) {
        $script:createdKeyId = $null
        @{ success = $true; detail = "API Key deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
