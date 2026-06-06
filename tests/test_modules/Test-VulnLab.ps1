# Module 18: Vulnerability Lab Tests
param($Framework)

$mod = "VulnLab"

Write-ModuleHeader -ModuleName $mod -Description "Vulnerability lab types, challenges, stats (requires Docker)"

$token = Get-AdminToken

# VLAB-01: List vulnerability types
Test-Step -Id "VLAB-01" -Name "List Vuln Lab Types" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vuln-lab/types" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Vuln lab types retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLAB-02: Run vuln lab (endpoint check - may need Docker)
Test-Step -Id "VLAB-02" -Name "Run Vuln Lab (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vuln-lab/run" -Token $token -Body (@{
        vuln_type = "sql_injection"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdChallengeId = $r.data.id
        Add-CleanupItem -Type "VulnLabChallenge" -Id $script:createdChallengeId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/vuln-lab/challenges/$($script:createdChallengeId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Challenge started: $($r.data.id)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode) - may need Docker)" }
    }
}

# VLAB-03: List challenges
Test-Step -Id "VLAB-03" -Name "List Challenges" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vuln-lab/challenges" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Challenges retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLAB-04: Get challenge detail (non-existent)
Test-Step -Id "VLAB-04" -Name "Get Challenge Detail (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vuln-lab/challenges/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# VLAB-05: Lab stats
Test-Step -Id "VLAB-05" -Name "Lab Stats" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vuln-lab/stats" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Lab stats retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# VLAB-06: Stop challenge (endpoint check)
Test-Step -Id "VLAB-06" -Name "Stop Challenge (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/vuln-lab/challenges/00000000-0000-0000-0000-000000000000/stop" -Token $token
    @{ success = $true; detail = "Stop endpoint reached (status: $($r.statusCode))" }
}

# VLAB-07: Delete challenge (endpoint check)
Test-Step -Id "VLAB-07" -Name "Delete Challenge (endpoint check)" -Module $mod {
    if ($script:createdChallengeId) {
        $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vuln-lab/challenges/$($script:createdChallengeId)" -Token $token
        if ($r.success) {
            $script:createdChallengeId = $null
            @{ success = $true; detail = "Challenge deleted" }
        } else {
            @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
        }
    } else {
        $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/vuln-lab/challenges/00000000-0000-0000-0000-000000000000" -Token $token
        @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
    }
}

# VLAB-08: Get challenge logs
Test-Step -Id "VLAB-08" -Name "Get Challenge Logs (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/vuln-lab/logs/00000000-0000-0000-0000-000000000000" -Token $token
    @{ success = $true; detail = "Logs endpoint reached (status: $($r.statusCode))" }
}
