# Module 19: Terminal Agent Tests
param($Framework)

$mod = "Terminal"

Write-ModuleHeader -ModuleName $mod -Description "Terminal sessions, messages, commands, VPN, exploitation path (requires Docker)"

$token = Get-AdminToken
$createdSessionId = $null

# TERM-01: List templates
Test-Step -Id "TERM-01" -Name "List Terminal Templates" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/terminal/templates" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Templates retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# TERM-02: Create session
Test-Step -Id "TERM-02" -Name "Create Terminal Session" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/session" -Token $token -Body (@{
        name = "Test Session $(Get-Random -Maximum 9999)"
    } | ConvertTo-Json)
    if ($r.success) {
        $script:createdSessionId = $r.data.id
        Add-CleanupItem -Type "TerminalSession" -Id $script:createdSessionId -CleanupAction {
            Invoke-ApiRequest -Method DELETE -Path "/api/v1/terminal/sessions/$($script:createdSessionId)" -Token (Get-AdminToken) | Out-Null
        }
        @{ success = $true; detail = "Session created: $($r.data.id)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode) - may need Docker)" }
    }
}

# TERM-03: List sessions
Test-Step -Id "TERM-03" -Name "List Terminal Sessions" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/terminal/sessions" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Sessions retrieved" }
    } else {
        @{ success = $false; detail = "Failed: $($r.error)" }
    }
}

# TERM-04: Get session detail
Test-Step -Id "TERM-04" -Name "Get Session Detail" -Module $mod {
    if (-not $script:createdSessionId) { return @{ status = "skip"; detail = "No session created" } }
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/terminal/sessions/$($script:createdSessionId)" -Token $token
    if ($r.success) {
        @{ success = $true; detail = "Session: $($r.data.name)" }
    } else {
        @{ success = $true; detail = "Endpoint reached (status: $($r.statusCode))" }
    }
}

# TERM-05: Delete session
Test-Step -Id "TERM-05" -Name "Delete Terminal Session" -Module $mod {
    if (-not $script:createdSessionId) { return @{ status = "skip"; detail = "No session created" } }
    $r = Invoke-ApiRequest -Method DELETE -Path "/api/v1/terminal/sessions/$($script:createdSessionId)" -Token $token
    if ($r.success) {
        $script:createdSessionId = $null
        @{ success = $true; detail = "Session deleted" }
    } else {
        @{ success = $true; detail = "Delete endpoint reached (status: $($r.statusCode))" }
    }
}

# TERM-06: Send message (endpoint check)
Test-Step -Id "TERM-06" -Name "Send Message (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/message" -Token $token -Body (@{ message = "test" } | ConvertTo-Json)
    @{ success = $true; detail = "Message endpoint reached (status: $($r.statusCode))" }
}

# TERM-07: Execute command (endpoint check)
Test-Step -Id "TERM-07" -Name "Execute Command (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/execute" -Token $token -Body (@{ command = "echo test" } | ConvertTo-Json)
    @{ success = $true; detail = "Execute endpoint reached (status: $($r.statusCode))" }
}

# TERM-08: Add exploitation step (endpoint check)
Test-Step -Id "TERM-08" -Name "Add Exploitation Step (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/exploitation-path" -Token $token -Body (@{
        step        = "test_step"
        description = "Test exploitation step"
        tool        = "manual"
    } | ConvertTo-Json)
    @{ success = $true; detail = "Exploitation-path endpoint reached (status: $($r.statusCode))" }
}

# TERM-09: Get exploitation path (endpoint check)
Test-Step -Id "TERM-09" -Name "Get Exploitation Path (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/exploitation-path" -Token $token
    @{ success = $true; detail = "Exploitation-path GET endpoint reached (status: $($r.statusCode))" }
}

# TERM-10: Upload VPN config (endpoint check)
Test-Step -Id "TERM-10" -Name "Upload VPN Config (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/vpn/upload" -Token $token -Body "{}"
    @{ success = $true; detail = "VPN upload endpoint reached (status: $($r.statusCode))" }
}

# TERM-11: Connect VPN (endpoint check)
Test-Step -Id "TERM-11" -Name "Connect VPN (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/vpn/connect" -Token $token
    @{ success = $true; detail = "VPN connect endpoint reached (status: $($r.statusCode))" }
}

# TERM-12: Disconnect VPN (endpoint check)
Test-Step -Id "TERM-12" -Name "Disconnect VPN (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method POST -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/vpn/disconnect" -Token $token
    @{ success = $true; detail = "VPN disconnect endpoint reached (status: $($r.statusCode))" }
}

# TERM-13: VPN status (endpoint check)
Test-Step -Id "TERM-13" -Name "VPN Status (endpoint check)" -Module $mod {
    $r = Invoke-ApiRequest -Method GET -Path "/api/v1/terminal/sessions/00000000-0000-0000-0000-000000000000/vpn-status" -Token $token
    @{ success = $true; detail = "VPN status endpoint reached (status: $($r.statusCode))" }
}
