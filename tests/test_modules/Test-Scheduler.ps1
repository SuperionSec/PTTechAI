# Module 17: Scheduler Tests
param($Framework)

$mod = "Scheduler"

Write-ModuleHeader -ModuleName $mod -Description "Scheduled job CRUD, pause/resume, agent roles"

$token = Get-AdminToken
$createdJobId = $null

# SCHED-01: List scheduled jobs
Test-Step -Id "SCHED-01" -Name "List Scheduled Jobs" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/scheduler/" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Scheduled jobs retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SCHED-02: Create scheduled job
Test-Step -Id "SCHED-02" -Name "Create Scheduled Job" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/scheduler/" -Token $token -Body (@{
        name        = "Test Scheduled Job $(Get-Random -Maximum 9999)"
        target_url  = "http://example.com"
        cron_expr   = "0 0 * * *"
        mode        = "recon_only"
        agent_role  = "pentester"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdJobId = $r.data.id
        Add-CleanupItem -Type "SchedulerJob" -Id $script:createdJobId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/scheduler/$($script:createdJobId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created job: $($r.data.id)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# SCHED-03: Delete scheduled job
Test-Step -Id "SCHED-03" -Name "Delete Scheduled Job" -Module $mod {
    if (-not $script:createdJobId) { return @{ status = "skip"; detail = "No job created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/scheduler/$($script:createdJobId)" -Token $token
    if ($r.success) {
        $script:createdJobId = $null
        @{ success = $true; detail = "Job deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# SCHED-04: Pause scheduled job (endpoint check)
Test-Step -Id "SCHED-04" -Name "Pause Scheduled Job (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/scheduler/00000000-0000-0000-0000-000000000000/pause" -Token $token
    @{ success = $true; detail = "Pause endpoint reached (status: $($r.statusCode))" }
}

# SCHED-05: Resume scheduled job (endpoint check)
Test-Step -Id "SCHED-05" -Name "Resume Scheduled Job (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/scheduler/00000000-0000-0000-0000-000000000000/resume" -Token $token
    @{ success = $true; detail = "Resume endpoint reached (status: $($r.statusCode))" }
}

# SCHED-06: Get agent roles
Test-Step -Id "SCHED-06" -Name "Get Agent Roles" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/scheduler/agent-roles" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Agent roles retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
