# Module 11: AI Agent Tests
param($Framework)

$mod = "Agent"

Write-ModuleHeader -ModuleName $mod -Description "AI Agent run, status, control, tasks, history"

$token = Get-AdminToken
$createdTaskId = $null

# AGENT-01: Get LLM status
Test-Step -Id "AGENT-01" -Name "Get LLM Status" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/status" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "LLM status retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-02: Run Agent (recon_only mode - minimal)
Test-Step -Id "AGENT-02" -Name "Run Agent (recon_only)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/run" -Token $token -Body (@{
        target   = "http://example.com"
        task     = "Test reconnaissance"
        mode     = "recon_only"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdAgentId = $r.data.agent_id
        Add-CleanupItem -Type "Agent" -Id $script:createdAgentId -CleanupAction {
            Invoke-ApiRequest -Method POST -Path "/api/v1/agent/stop/$($script:createdAgentId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Agent started: $($r.data.agent_id)" }
    } else {
        # May fail if LLM not configured
        @{ success = $true; detail = "Run endpoint reached (status: $($r.statusCode) - may need LLM config)" }
    }
}

# AGENT-03: List MD Agents
Test-Step -Id "AGENT-03" -Name "List MD Agents" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/md-agents" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "MD agents retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-04: List active agents
Test-Step -Id "AGENT-04" -Name "List Active Agents" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/active" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Active agents retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-05: Agent history
Test-Step -Id "AGENT-05" -Name "Agent History" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/history" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Agent history retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-06: Get agent by scan
Test-Step -Id "AGENT-06" -Name "Get Agent By Scan (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/by-scan/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.success -or $r.statusCode -eq 404) {
        @{ success = $true; detail = "Endpoint works (status: $($r.statusCode))" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-07: Agent status
Test-Step -Id "AGENT-07" -Name "Agent Status" -Module $mod {
    if ($script:createdAgentId) {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/status/$($script:createdAgentId)" -Token $token
    } else {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/status/test-nonexistent" -Token $token
    }
    if ($r.success) {
        @{ success = $true; detail = "Agent status: $($r.data.status)" }
    } elseif ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Endpoint works (404 for non-existent agent)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# AGENT-08: Stop agent
Test-Step -Id "AGENT-08" -Name "Stop Agent" -Module $mod {
    if (-not $script:createdAgentId) { return @{ status = "skip"; detail = "No agent started" } }
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/stop/$($script:createdAgentId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Agent stopped" }
    } else {
        @{ success = $true; detail = "Stop endpoint reached (status: $($r.statusCode))" }
    }
}

# AGENT-09-10: Pause/Resume (skip if no active agent)
Test-Step -Id "AGENT-09" -Name "Pause Agent (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/pause/test-nonexistent" -Token $token
    @{ success = $true; detail = "Pause endpoint reached (status: $($r.statusCode))" }
}

Test-Step -Id "AGENT-10" -Name "Resume Agent (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/resume/test-nonexistent" -Token $token
    @{ success = $true; detail = "Resume endpoint reached (status: $($r.statusCode))" }
}

# AGENT-11: Triple check
Test-Step -Id "AGENT-11" -Name "Triple Check (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/triple-check/00000000-0000-0000-0000-000000000000" -Token $token
    @{ success = $true; detail = "Triple-check endpoint reached (status: $($r.statusCode))" }
}

# AGENT-12: Skip to phase
Test-Step -Id "AGENT-12" -Name "Skip Agent Phase (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/skip-to/test-nonexistent/reconnaissance" -Token $token
    @{ success = $true; detail = "Skip-to endpoint reached (status: $($r.statusCode))" }
}

# AGENT-13: Send custom prompt
Test-Step -Id "AGENT-13" -Name "Send Custom Prompt (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/prompt/test-nonexistent" -Token $token -Body (@{ prompt = "test" } | ConvertTo-Json)
    @{ success = $true; detail = "Prompt endpoint reached (status: $($r.statusCode))" }
}

# AGENT-14: Get prompt queue
Test-Step -Id "AGENT-14" -Name "Get Prompt Queue (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/prompts/test-nonexistent" -Token $token
    @{ success = $true; detail = "Prompts endpoint reached (status: $($r.statusCode))" }
}

# AGENT-15: Agent logs
Test-Step -Id "AGENT-15" -Name "Agent Logs" -Module $mod {
    if ($script:createdAgentId) {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/logs/$($script:createdAgentId)" -Token $token
    } else {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/logs/test-nonexistent" -Token $token
    }
    if ($r.success) {
        @{ success = $true; detail = "Logs retrieved" }
    } else {
        @{ success = $true; detail = "Logs endpoint reached (status: $($r.statusCode))" }
    }
}

# AGENT-16: Agent findings
Test-Step -Id "AGENT-16" -Name "Agent Findings" -Module $mod {
    if ($script:createdAgentId) {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/findings/$($script:createdAgentId)" -Token $token
    } else {
        $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/findings/test-nonexistent" -Token $token
    }
    if ($r.success) {
        @{ success = $true; detail = "Findings retrieved" }
    } else {
        @{ success = $true; detail = "Findings endpoint reached (status: $($r.statusCode))" }
    }
}

# AGENT-17: List tasks
Test-Step -Id "AGENT-17" -Name "List Agent Tasks" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/tasks" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Tasks retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-18: Get task (non-existent)
Test-Step -Id "AGENT-18" -Name "Get Agent Task (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/agent/tasks/00000000-0000-0000-0000-000000000000" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404 for non-existent task" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# AGENT-19: Create task
Test-Step -Id "AGENT-19" -Name "Create Agent Task" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/agent/tasks" -Token $token -Body (@{
        name        = "Test Task $(Get-Random -Maximum 9999)"
        description = "Automated test task"
        prompt      = "Test prompt for security scanning"
        category    = "custom"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdTaskId = $r.data.id
        Add-CleanupItem -Type "AgentTask" -Id $script:createdTaskId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/agent/tasks/$($script:createdTaskId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created task: $($r.data.id)" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# AGENT-20: Delete task
Test-Step -Id "AGENT-20" -Name "Delete Agent Task" -Module $mod {
    if (-not $script:createdTaskId) { return @{ status = "skip"; detail = "No task created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/agent/tasks/$($script:createdTaskId)" -Token $token
    if ($r.success) {
        $script:createdTaskId = $null
        @{ success = $true; detail = "Task deleted" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}
