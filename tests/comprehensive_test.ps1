# Comprehensive Test Script for PTTechAI
# Tests: Login, Token Management, SSO, Role Permissions, User Management

$baseUrl = "http://localhost:8000"
$results = @()

function Test-Step {
    param($Name, $ScriptBlock)
    Write-Host "`n[Test] $Name" -ForegroundColor Cyan
    try {
        $result = & $ScriptBlock
        if ($result -eq $true -or $result.success -eq $true) {
            Write-Host "  PASS" -ForegroundColor Green
            $script:results += @{Name=$Name; Status="PASS"; Detail=$result.detail}
            return $true
        } else {
            Write-Host "  FAIL: $($result.detail)" -ForegroundColor Red
            $script:results += @{Name=$Name; Status="FAIL"; Detail=$result.detail}
            return $false
        }
    } catch {
        $errMsg = $_.Exception.Message
        Write-Host "  ERROR: $errMsg" -ForegroundColor Red
        $script:results += @{Name=$Name; Status="ERROR"; Detail=$errMsg}
        return $false
    }
}

# Test 1: Admin Login
Test-Step "1. Admin Login" {
    $body = '{"email": "admin@bctech.ai", "password": "admin123"}'
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    if ($response.access_token) {
        $script:adminToken = $response.access_token
        $script:adminRefresh = $response.refresh_token
        @{success=$true; detail="Token received"}
    } else {
        @{success=$false; detail="No token returned"}
    }
}

# Test 2: Token Validation
Test-Step "2. Token Validation" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/me" -Method GET -Headers $headers
    if ($response.email -eq "admin@bctech.ai") {
        @{success=$true; detail="User: $($response.email), Role: $($response.role)"}
    } else {
        @{success=$false; detail="Invalid user data"}
    }
}

# Test 3: Token Refresh
Test-Step "3. Token Refresh" {
    $body = '{"refresh_token": "' + $script:adminRefresh + '"}'
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/refresh" -Method POST -ContentType "application/json" -Body $body
    if ($response.access_token) {
        $script:adminToken = $response.access_token
        @{success=$true; detail="New token received"}
    } else {
        @{success=$false; detail="Refresh failed"}
    }
}

# Test 4: Single Sign-On (New login invalidates old token)
Test-Step "4. Single Sign-On Test" {
    # First login
    $body = '{"email": "admin@bctech.ai", "password": "admin123"}'
    $response1 = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $oldToken = $response1.access_token
    
    # Second login (should invalidate first)
    Start-Sleep -Milliseconds 500
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $newToken = $response2.access_token
    
    # Try using old token
    $headers = @{Authorization = "Bearer $oldToken"}
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/me" -Method GET -Headers $headers
        @{success=$false; detail="Old token still valid - SSO not working"}
    } catch {
        if ($_.Exception.Response.StatusCode.Value__ -eq 401) {
            $script:adminToken = $newToken
            $script:adminRefresh = $response2.refresh_token
            @{success=$true; detail="Old token revoked, new token works"}
        } else {
            @{success=$false; detail="Unexpected error: $_"}
        }
    }
}

# Test 5: Create User Role
Test-Step "5. Create Normal User" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    $script:testUserEmail = "testuser_perm@example.com"
    $body = "{`"email`": `"$script:testUserEmail`", `"password`": `"user123456`", `"full_name`": `"Test User`", `"role`": `"user`"}"
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/users" -Method POST -ContentType "application/json" -Headers $headers -Body $body
    } catch {
        # User may already exist
    }
    @{success=$true; detail="User ready: $script:testUserEmail"}
}

# Test 6: Create Viewer Role
Test-Step "6. Create Viewer User" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    $script:testViewerEmail = "testviewer_perm@example.com"
    $body = "{`"email`": `"$script:testViewerEmail`", `"password`": `"viewer123456`", `"full_name`": `"Test Viewer`", `"role`": `"viewer`"}"
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/users" -Method POST -ContentType "application/json" -Headers $headers -Body $body
    } catch {
        # User may already exist
    }
    @{success=$true; detail="Viewer ready: $script:testViewerEmail"}
}

# Test 7: Create Service Role
Test-Step "7. Create Service User" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    $script:testServiceEmail = "testservice_perm@example.com"
    $body = "{`"email`": `"$script:testServiceEmail`", `"password`": `"service123456`", `"full_name`": `"Test Service`", `"role`": `"service`"}"
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/users" -Method POST -ContentType "application/json" -Headers $headers -Body $body
    } catch {
        # User may already exist
    }
    @{success=$true; detail="Service user ready: $script:testServiceEmail"}
}

# Test 8: User Login
Test-Step "8. Normal User Login" {
    $body = "{`"email`": `"$script:testUserEmail`", `"password`": `"user123456`"}"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    if ($response.access_token) {
        $script:userToken = $response.access_token
        @{success=$true; detail="User logged in"}
    } else {
        @{success=$false; detail="Login failed"}
    }
}

# Test 9: User Access Control
Test-Step "9. User Role Permissions" {
    $headers = @{Authorization = "Bearer $script:userToken"}
    # Should be able to access scans
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/scans" -Method GET -Headers $headers
        $scansAccess = $true
    } catch { $scansAccess = $false }
    
    # Should NOT be able to access user management
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/users" -Method GET -Headers $headers
        $usersAccess = $true
    } catch { $usersAccess = $false }
    
    if ($scansAccess -and -not $usersAccess) {
        @{success=$true; detail="User can access scans but not user management"}
    } else {
        @{success=$false; detail="Permission mismatch: scans=$scansAccess, users=$usersAccess"}
    }
}

# Test 10: Service Role API Access
Test-Step "10. Service Role - Allowed APIs" {
    # Login as service
    $body = "{`"email`": `"$script:testServiceEmail`", `"password`": `"service123456`"}"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $serviceToken = $response.access_token
    $headers = @{Authorization = "Bearer $serviceToken"}
    
    # Test /agent/run (should work - may return 422 due to missing body fields, but not 403)
    try {
        $body = '{"target": "http://example.com", "task": "test", "mode": "recon_only"}'
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/agent/run" -Method POST -ContentType "application/json" -Headers $headers -Body $body
        $runAccess = $true
        $agentId = $response.agent_id
    } catch { 
        $err = $_
        $runAccess = ($err.Exception.Response.StatusCode.Value__ -ne 403)
    }
    
    # Test /agent/status/{agent_id} (should not be 403)
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/agent/status/test-agent-123" -Method GET -Headers $headers
        $statusAccess = $true
    } catch { 
        $err = $_
        $statusAccess = ($err.Exception.Response.StatusCode.Value__ -ne 403)
    }
    
    if ($runAccess -and $statusAccess) {
        @{success=$true; detail="Service can access /run and /status/{agent_id} (not blocked by permission)"}
    } else {
        @{success=$false; detail="run=$runAccess, status=$statusAccess"}
    }
}

# Test 11: Service Role - Denied APIs
Test-Step "11. Service Role - Denied APIs" {
    $body = "{`"email`": `"$script:testServiceEmail`", `"password`": `"service123456`"}"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $serviceToken = $response.access_token
    $headers = @{Authorization = "Bearer $serviceToken"}
    
    # Try accessing /agent/history (should be denied)
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/agent/history" -Method GET -Headers $headers
        $historyAccess = $true
    } catch { 
        $historyAccess = $false 
    }
    
    # Try accessing /scans (should be denied)
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/scans" -Method GET -Headers $headers
        $scansAccess = $true
    } catch { 
        $scansAccess = $false 
    }
    
    if (-not $historyAccess -and -not $scansAccess) {
        @{success=$true; detail="Service correctly denied access to /history and /scans"}
    } else {
        @{success=$false; detail="history=$historyAccess, scans=$scansAccess"}
    }
}

# Test 12: Role Management API
Test-Step "12. Role Management API" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/roles" -Method GET -Headers $headers
    if ($response.Count -eq 4) {
        $roles = $response | ForEach-Object { $_.role }
        @{success=$true; detail="Roles: $($roles -join ', ')"}
    } else {
        @{success=$false; detail="Expected 4 roles, got $($response.Count)"}
    }
}

# Test 13: Token Storage in Database
Test-Step "13. Token Database Storage" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    # This would require direct DB access, so we verify indirectly
    # by checking if token revocation works
    $body = '{"email": "admin@bctech.ai", "password": "admin123"}'
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $newToken = $response.access_token
    
    # Old token should be revoked
    $oldHeaders = @{Authorization = "Bearer $script:adminToken"}
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/me" -Method GET -Headers $oldHeaders
        @{success=$false; detail="Old token still valid"}
    } catch {
        $script:adminToken = $newToken
        @{success=$true; detail="Old token revoked, new token active"}
    }
}

# Test 14: Viewer Role Permissions
Test-Step "14. Viewer Role Permissions" {
    $body = "{`"email`": `"$script:testViewerEmail`", `"password`": `"viewer123456`"}"
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/system/profile/login" -Method POST -ContentType "application/json" -Body $body
    $viewerToken = $response.access_token
    $headers = @{Authorization = "Bearer $viewerToken"}
    
    # Should be able to read scans
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/scans" -Method GET -Headers $headers
        $readAccess = $true
    } catch { $readAccess = $false }
    
    # Should NOT be able to create scans
    try {
        $body = '{"target": "http://test.com"}'
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/scans" -Method POST -ContentType "application/json" -Headers $headers -Body $body
        $writeAccess = $true
    } catch { $writeAccess = $false }
    
    if ($readAccess -and -not $writeAccess) {
        @{success=$true; detail="Viewer can read but not write"}
    } else {
        @{success=$false; detail="read=$readAccess, write=$writeAccess"}
    }
}

# Test 15: Dashboard Stats Access
Test-Step "15. Dashboard Stats Access" {
    $headers = @{Authorization = "Bearer $script:adminToken"}
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/dashboard/stats" -Method GET -Headers $headers
        @{success=$true; detail="Stats retrieved: total_scans=$($response.total_scans)"}
    } catch {
        @{success=$false; detail="Failed to get stats"}
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "Test Summary" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
$passed = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failed = ($results | Where-Object { $_.Status -ne "PASS" }).Count
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor Red
Write-Host "Total: $($results.Count)" -ForegroundColor White

if ($failed -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    $results | Where-Object { $_.Status -ne "PASS" } | ForEach-Object {
        Write-Host "  - $($_.Name): $($_.Detail)" -ForegroundColor Red
    }
}
