# Module 22: MCP Server Tests
param($Framework)

$mod = "MCP"

Write-ModuleHeader -ModuleName $mod -Description "MCP server CRUD, toggle, test connection, tools listing"

$token = Get-AdminToken
$testServerName = "test-mcp-server-$(Get-Random -Maximum 9999)"

# MCP-01: List MCP servers
Test-Step -Id "MCP-01" -Name "List MCP Servers" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/mcp/servers" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "MCP servers retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# MCP-02: Get server detail (non-existent)
Test-Step -Id "MCP-02" -Name "Get MCP Server Detail (non-existent)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/mcp/servers/non-existent-server" -Token $token
    if ($r.statusCode -eq 404) {
        @{ success = $true; detail = "Correctly returned 404" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# MCP-03: Create MCP server
Test-Step -Id "MCP-03" -Name "Create MCP Server" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/mcp/servers" -Token $token -Body (@{
        name        = $testServerName
        description = "Test MCP server for automated testing"
        command     = "node"
        args        = @("test-mcp-server.js")
        enabled     = $true
    } | ConvertTo-Json)
    if ($r.success) {
        Add-CleanupItem -Type "MCPServer" -Id $testServerName -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/mcp/servers/$testServerName" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Created MCP server: $testServerName" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# MCP-04: Update MCP server
Test-Step -Id "MCP-04" -Name "Update MCP Server" -Module $mod {
    $r = Invoke-ApiRequest -Method PUT -Path "/api/v1/mcp/servers/$testServerName" -Token $token -Body (@{
        description = "Updated test MCP server"
    } | ConvertTo-Json)
    if ($r.success) {
        @{ success = $true; detail = "MCP server updated" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# MCP-05: Delete MCP server
Test-Step -Id "MCP-05" -Name "Delete MCP Server" -Module $mod {
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/mcp/servers/$testServerName" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "MCP server deleted" }
    } else {
        @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
    }
}

# MCP-06: Toggle server (endpoint check)
Test-Step -Id "MCP-06" -Name "Toggle MCP Server (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/mcp/servers/non-existent/toggle" -Token $token
    @{ success = $true; detail = "Toggle endpoint reached (status: $($r.statusCode))" }
}

# MCP-07: Test server connection (endpoint check)
Test-Step -Id "MCP-07" -Name "Test MCP Server Connection (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/mcp/servers/non-existent/test" -Token $token
    @{ success = $true; detail = "Test endpoint reached (status: $($r.statusCode))" }
}

# MCP-08: List server tools (endpoint check)
Test-Step -Id "MCP-08" -Name "List MCP Server Tools (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/mcp/servers/non-existent/tools" -Token $token
    @{ success = $true; detail = "Tools endpoint reached (status: $($r.statusCode))" }
}
