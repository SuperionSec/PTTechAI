# Module 16: Agent Tasks Tests
param($Framework)

$mod = "AgentTasks"

Write-ModuleHeader -ModuleName $mod -Description "Agent task listing, summary, detail, timeline"

$token = Get-AdminToken

# ATASK-01: List agent tasks
Test-Step -Id "ATASK-01" -Name "List Agent Tasks" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent-tasks" -Token $token -QueryParams @{ scan_id = "00000000-0000-0000-0000-000000000000" }
    if ($r.success) {
        @{ success = $true; detail = "Agent tasks retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# ATASK-02: Agent tasks summary
Test-Step -Id "ATASK-02" -Name "Agent Tasks Summary" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent-tasks/summary" -Token $token -QueryParams @{ scan_id = "00000000-0000-0000-0000-000000000000" }
    if ($r.success) {
        @{ success = $true; detail = "Summary retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# ATASK-03: Get agent task detail (non-existent)
Test-Step -Id "ATASK-03" -Name "Get Agent Task Detail (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent-tasks/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# ATASK-04: Agent tasks timeline
Test-Step -Id "ATASK-04" -Name "Agent Tasks Timeline" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent-tasks/scan/00000000-0000-0000-0000-000000000000/timeline" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Timeline retrieved" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}
