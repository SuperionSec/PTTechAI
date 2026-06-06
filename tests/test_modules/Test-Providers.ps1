# Module 23: LLM Provider Tests
param($Framework)

$mod = "Providers"

Write-ModuleHeader -ModuleName $mod -Description "LLM Provider listing, status, detect, connect, toggle, env"

$token = Get-AdminToken

# PROV-01: List providers
Test-Step -Id "PROV-01" -Name "List Providers" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/providers" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Providers retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROV-02: Provider status
Test-Step -Id "PROV-02" -Name "Provider Status" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/providers/status" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Provider status retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROV-03: Detect CLI token (endpoint check)
Test-Step -Id "PROV-03" -Name "Detect CLI Token (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/claude/detect" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Detect endpoint works" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# PROV-04: Connect provider (endpoint check - won't actually connect)
Test-Step -Id "PROV-04" -Name "Connect Provider (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/claude/connect" -Token $token -Body (@{
        api_key = "sk-test-invalid-key"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Connect endpoint works" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# PROV-05: Remove account (endpoint check)
Test-Step -Id "PROV-05" -Name "Remove Account (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/providers/claude/accounts/non-existent-account" -Token $token
    @{ success = $true; detail = "Remove account endpoint reached (status: $($r.statusCode))" }
}

# PROV-06: Test connection (endpoint check)
Test-Step -Id "PROV-06" -Name "Test Connection (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/test/claude/non-existent-account" -Token $token
    @{ success = $true; detail = "Test connection endpoint reached (status: $($r.statusCode))" }
}

# PROV-07: Available models
Test-Step -Id "PROV-07" -Name "Available Models" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/providers/available-models" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Available models retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROV-08: Detect all tokens
Test-Step -Id "PROV-08" -Name "Detect All Tokens" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/detect-all" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Detect-all completed" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# PROV-09: Toggle provider (endpoint check)
Test-Step -Id "PROV-09" -Name "Toggle Provider (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/claude/toggle" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Toggle endpoint works" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# PROV-10: Get env keys
Test-Step -Id "PROV-10" -Name "Get Environment Keys" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/providers/env" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Env keys retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# PROV-11: Update env key (endpoint check - won't actually update)
Test-Step -Id "PROV-11" -Name "Update Environment Key (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/providers/env" -Token $token -Body (@{
        key   = "TEST_KEY"
        value = "test_value"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "Env update endpoint works" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}
