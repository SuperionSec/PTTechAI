# Module 24: FULL AI Testing + Module 25: CLI Agent Tests
param($Framework)

$mod1 = "FullIA"
$mod2 = "CLIAgent"

$token = Get-AdminToken

# FULLIA-01: Get FULL AI prompt
Write-ModuleHeader -ModuleName $mod1 -Description "FULL AI testing prompt"
Test-Step -Id "FULLIA-01" -Name "Get FULL AI Prompt" -Module $mod1 {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/full-ia/prompt" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "FULL AI prompt retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# CLI-01: List CLI providers
Write-ModuleHeader -ModuleName $mod2 -Description "CLI Agent providers and methodologies"
Test-Step -Id "CLI-01" -Name "List CLI Providers" -Module $mod2 {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/cli-agent/providers" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "CLI providers retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# CLI-02: List methodologies
Test-Step -Id "CLI-02" -Name "List Methodologies" -Module $mod2 {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/cli-agent/methodologies" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Methodologies retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
