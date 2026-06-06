# PTTechAI Test Framework - Shared Module
# Provides common test utilities, result tracking, and report generation

$Script:TestResults = @()
$Script:TestStartTime = $null
$Script:BaseUrl = "http://localhost:8000"
$Script:AdminToken = $null
$Script:AdminRefresh = $null
$Script:UserToken = $null
$Script:ViewerToken = $null
$Script:ServiceToken = $null
$Script:TestUserEmail = "test_system_user@example.com"
$Script:TestViewerEmail = "test_system_viewer@example.com"
$Script:TestServiceEmail = "test_system_service@example.com"
$Script:TestUserPassword = "TestPass123!"
$Script:AdminEmail = "admin@bctech.ai"
$Script:AdminPassword = "admin123"
$Script:CleanupItems = @()

function Set-TestBaseUrl {
    param([string]$Url)
    $Script:BaseUrl = $Url
}

function Get-TestBaseUrl { $Script:BaseUrl }

function Set-AdminToken {
    param([string]$Token, [string]$RefreshToken)
    $Script:AdminToken = $Token
    $Script:AdminRefresh = $RefreshToken
}

function Get-AdminToken { $Script:AdminToken }
function Get-AdminRefresh { $Script:AdminRefresh }
function Get-UserToken { $Script:UserToken }
function Get-ViewerToken { $Script:ViewerToken }
function Get-ServiceToken { $Script:ServiceToken }

function Add-CleanupItem {
    param([string]$Type, [string]$Id, [scriptblock]$CleanupAction)
    $Script:CleanupItems += @{ Type = $Type; Id = $Id; Action = $CleanupAction }
}

function Start-TestSession {
    $Script:TestResults = @()
    $Script:TestStartTime = Get-Date
    $Script:CleanupItems = @()
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "PTTechAI System Test Suite" -ForegroundColor Cyan
    Write-Host "Started: $($Script:TestStartTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Cyan
    Write-Host "Target: $Script:BaseUrl" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Stop-TestSession {
    $endTime = Get-Date
    $duration = $endTime - $Script:TestStartTime

    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "Test Session Summary" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow

    $passed = ($Script:TestResults | Where-Object { $_.Status -eq "PASS" }).Count
    $failed = ($Script:TestResults | Where-Object { $_.Status -eq "FAIL" }).Count
    $errors = ($Script:TestResults | Where-Object { $_.Status -eq "ERROR" }).Count
    $skipped = ($Script:TestResults | Where-Object { $_.Status -eq "SKIP" }).Count
    $total = $Script:TestResults.Count

    Write-Host "Total:  $total" -ForegroundColor White
    Write-Host "Passed: $passed" -ForegroundColor Green
    Write-Host "Failed: $failed" -ForegroundColor Red
    Write-Host "Errors: $errors" -ForegroundColor Magenta
    Write-Host "Skipped: $skipped" -ForegroundColor Yellow
    Write-Host "Duration: $($duration.ToString('hh\:mm\:ss'))" -ForegroundColor White

    if ($failed -gt 0 -or $errors -gt 0) {
        Write-Host "`nFailed/Error Tests:" -ForegroundColor Red
        $Script:TestResults | Where-Object { $_.Status -ne "PASS" -and $_.Status -ne "SKIP" } | ForEach-Object {
            Write-Host "  [$($_.Status)] $($_.Id): $($_.Name) - $($_.Detail)" -ForegroundColor Red
        }
    }

    # Generate report
    $reportPath = Generate-TestReport -EndTime $endTime -Duration $duration
    Write-Host "`nReport saved to: $reportPath" -ForegroundColor Green

    return @{ Passed = $passed; Failed = $failed; Errors = $errors; Skipped = $skipped; Total = $total; ReportPath = $reportPath }
}

function Test-Step {
    param(
        [Parameter(Mandatory)]
        [string]$Id,
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,
        [string]$Module = "General"
    )

    Write-Host "`n[$Id] $Name" -ForegroundColor Cyan
    try {
        $result = & $ScriptBlock
        if ($result -is [hashtable]) {
            if ($result.status -eq "skip") {
                Write-Host "  SKIP: $($result.detail)" -ForegroundColor Yellow
                $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "SKIP"; Detail = $result.detail; Timestamp = Get-Date }
                return "SKIP"
            }
            if ($result.success -eq $true) {
                Write-Host "  PASS: $($result.detail)" -ForegroundColor Green
                $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "PASS"; Detail = $result.detail; Timestamp = Get-Date }
                return $true
            } else {
                Write-Host "  FAIL: $($result.detail)" -ForegroundColor Red
                $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "FAIL"; Detail = $result.detail; Timestamp = Get-Date }
                return $false
            }
        } elseif ($result -eq $true) {
            Write-Host "  PASS" -ForegroundColor Green
            $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "PASS"; Detail = "OK"; Timestamp = Get-Date }
            return $true
        } else {
            Write-Host "  FAIL: Unexpected result" -ForegroundColor Red
            $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "FAIL"; Detail = "Unexpected result: $result"; Timestamp = Get-Date }
            return $false
        }
    } catch {
        $errMsg = $_.Exception.Message
        if ($errMsg.Length -gt 200) { $errMsg = $errMsg.Substring(0, 200) + "..." }
        Write-Host "  ERROR: $errMsg" -ForegroundColor Magenta
        $Script:TestResults += @{ Id = $Id; Name = $Name; Module = $Module; Status = "ERROR"; Detail = $errMsg; Timestamp = Get-Date }
        return "ERROR"
    }
}

function Invoke-ApiRequest {
    param(
        [Parameter(Mandatory)]
        [string]$Method,
        [Parameter(Mandatory)]
        [string]$Path,
        [string]$Token,
        [object]$Body,
        [hashtable]$QueryParams,
        [string]$ContentType = "application/json"
    )

    $url = "$Script:BaseUrl$Path"

    if ($QueryParams -and $QueryParams.Count -gt 0) {
        $qs = ($QueryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$([System.Uri]::EscapeDataString($_.Value))" }) -join "&"
        $url += "?$qs"
    }

    $headers = @{}
    if ($Token) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $params = @{
        Uri         = $url
        Method      = $Method
        Headers     = $headers
        ContentType = $ContentType
        ErrorAction = "Stop"
    }

    if ($Body -and $Method -ne "GET") {
        if ($Body -is [string]) {
            $params["Body"] = $Body
        } else {
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
        }
    }

    try {
        $response = Invoke-RestMethod @params
        return @{ success = $true; data = $response; statusCode = 200 }
    } catch {
        $statusCode = 0
        $errorDetail = $_.Exception.Message
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
                $errorBody = $reader.ReadToEnd()
                $reader.Close()
                if ($errorBody) { $errorDetail = $errorBody }
            } catch {}
        }
        return @{ success = $false; statusCode = $statusCode; error = $errorDetail }
    }
}

function Initialize-TestAuth {
    Write-Host "`n--- Initializing Test Authentication ---" -ForegroundColor Cyan

    # Admin login
    $result = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = $Script:AdminEmail; password = $Script:AdminPassword } | ConvertTo-Json)
    if ($result.success -and $result.data.access_token) {
        $Script:AdminToken = $result.data.access_token
        $Script:AdminRefresh = $result.data.refresh_token
        Write-Host "  Admin login: OK" -ForegroundColor Green
    } else {
        Write-Host "  Admin login FAILED: $($result.error)" -ForegroundColor Red
        return $false
    }

    # Create test users if not exist (try both /users and /register endpoints)
    $testUsers = @(
        @{ email = $Script:TestUserEmail; password = $Script:TestUserPassword; full_name = "Test User"; role = "user" },
        @{ email = $Script:TestViewerEmail; password = $Script:TestUserPassword; full_name = "Test Viewer"; role = "viewer" },
        @{ email = $Script:TestServiceEmail; password = $Script:TestUserPassword; full_name = "Test Service"; role = "service" }
    )

    foreach ($tu in $testUsers) {
        $createResult = Invoke-ApiRequest -Method POST -Path "/api/v1/system/users" -Token $Script:AdminToken -Body ($tu | ConvertTo-Json)
        if ($createResult.success) {
            Write-Host "  Created $($tu.role) user: $($tu.email)" -ForegroundColor Green
        } else {
            # Try register endpoint as fallback
            $regResult = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/register" -Token $Script:AdminToken -Body ($tu | ConvertTo-Json)
            if ($regResult.success) {
                Write-Host "  Registered $($tu.role) user: $($tu.email)" -ForegroundColor Green
            } else {
                Write-Host "  User $($tu.email) may already exist (status: $($createResult.statusCode)/$($regResult.statusCode))" -ForegroundColor Yellow
            }
        }
    }

    # Login as each test user
    $userResult = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = $Script:TestUserEmail; password = $Script:TestUserPassword } | ConvertTo-Json)
    if ($userResult.success -and $userResult.data.access_token) {
        $Script:UserToken = $userResult.data.access_token
        Write-Host "  User login: OK" -ForegroundColor Green
    } else {
        Write-Host "  User login FAILED" -ForegroundColor Red
    }

    $viewerResult = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = $Script:TestViewerEmail; password = $Script:TestUserPassword } | ConvertTo-Json)
    if ($viewerResult.success -and $viewerResult.data.access_token) {
        $Script:ViewerToken = $viewerResult.data.access_token
        Write-Host "  Viewer login: OK" -ForegroundColor Green
    } else {
        Write-Host "  Viewer login FAILED" -ForegroundColor Red
    }

    $serviceResult = Invoke-ApiRequest -Method POST -Path "/api/v1/system/profile/login" -Body (@{ email = $Script:TestServiceEmail; password = $Script:TestUserPassword } | ConvertTo-Json)
    if ($serviceResult.success -and $serviceResult.data.access_token) {
        $Script:ServiceToken = $serviceResult.data.access_token
        Write-Host "  Service login: OK" -ForegroundColor Green
    } else {
        Write-Host "  Service login FAILED" -ForegroundColor Red
    }

    return $true
}

function Invoke-Cleanup {
    Write-Host "`n--- Running Cleanup ---" -ForegroundColor Yellow
    foreach ($item in $Script:CleanupItems) {
        try {
            & $item.Action
            Write-Host "  Cleaned up $($item.Type): $($item.Id)" -ForegroundColor Green
        } catch {
            Write-Host "  Failed to cleanup $($item.Type): $($item.Id) - $_" -ForegroundColor Red
        }
    }
    $Script:CleanupItems = @()
}

function Generate-TestReport {
    param(
        [datetime]$EndTime,
        [timespan]$Duration
    )

    $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
    $reportDir = Join-Path $PSScriptRoot "reports"
    if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

    $reportPath = Join-Path $reportDir "test_report_$timestamp.md"

    $passed = ($Script:TestResults | Where-Object { $_.Status -eq "PASS" }).Count
    $failed = ($Script:TestResults | Where-Object { $_.Status -eq "FAIL" }).Count
    $errors = ($Script:TestResults | Where-Object { $_.Status -eq "ERROR" }).Count
    $skipped = ($Script:TestResults | Where-Object { $_.Status -eq "SKIP" }).Count
    $total = $Script:TestResults.Count
    $passRate = if ($total -gt 0) { [math]::Round(($passed / $total) * 100, 1) } else { 0 }

    $sb = [System.Text.StringBuilder]::new()

    [void]$sb.AppendLine("# PTTechAI System Test Report")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Item | Value |")
    [void]$sb.AppendLine("|------|-------|")
    [void]$sb.AppendLine("| Test Date | $($Script:TestStartTime.ToString('yyyy-MM-dd HH:mm:ss')) |")
    [void]$sb.AppendLine("| End Date | $($EndTime.ToString('yyyy-MM-dd HH:mm:ss')) |")
    [void]$sb.AppendLine("| Duration | $($Duration.ToString('hh\:mm\:ss')) |")
    [void]$sb.AppendLine("| Target | $Script:BaseUrl |")
    [void]$sb.AppendLine("| Total Tests | $total |")
    [void]$sb.AppendLine("| Passed | $passed |")
    [void]$sb.AppendLine("| Failed | $failed |")
    [void]$sb.AppendLine("| Errors | $errors |")
    [void]$sb.AppendLine("| Skipped | $skipped |")
    [void]$sb.AppendLine("| Pass Rate | $passRate% |")
    [void]$sb.AppendLine("")

    # Module summary
    [void]$sb.AppendLine("## Module Summary")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Module | Total | PASS | FAIL | ERROR | SKIP |")
    [void]$sb.AppendLine("|--------|-------|------|------|-------|------|")

    $modules = $Script:TestResults | Group-Object Module | Sort-Object Name
    foreach ($mod in $modules) {
        $mPass = ($mod.Group | Where-Object { $_.Status -eq "PASS" }).Count
        $mFail = ($mod.Group | Where-Object { $_.Status -eq "FAIL" }).Count
        $mErr = ($mod.Group | Where-Object { $_.Status -eq "ERROR" }).Count
        $mSkip = ($mod.Group | Where-Object { $_.Status -eq "SKIP" }).Count
        [void]$sb.AppendLine("| $($mod.Name) | $($mod.Count) | $mPass | $mFail | $mErr | $mSkip |")
    }
    [void]$sb.AppendLine("")

    # Detailed results
    [void]$sb.AppendLine("## Detailed Results")
    [void]$sb.AppendLine("")

    foreach ($mod in $modules) {
        [void]$sb.AppendLine("### $($mod.Name)")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("| ID | Test | Status | Detail |")
        [void]$sb.AppendLine("|----|------|--------|--------|")
        foreach ($r in ($mod.Group | Sort-Object Id)) {
            $detail = if ($r.Detail.Length -gt 80) { $r.Detail.Substring(0, 80) + "..." } else { $r.Detail }
            $detail = $detail -replace '\|', '\|'
            [void]$sb.AppendLine("| $($r.Id) | $($r.Name) | $($r.Status) | $detail |")
        }
        [void]$sb.AppendLine("")
    }

    # Failed tests detail
    $failedTests = $Script:TestResults | Where-Object { $_.Status -eq "FAIL" -or $_.Status -eq "ERROR" }
    if ($failedTests) {
        [void]$sb.AppendLine("## Failed Tests Detail")
        [void]$sb.AppendLine("")
        foreach ($ft in $failedTests) {
            [void]$sb.AppendLine("### [$($ft.Status)] $($ft.Id): $($ft.Name)")
            [void]$sb.AppendLine("- Module: $($ft.Module)")
            [void]$sb.AppendLine("- Detail: $($ft.Detail)")
            [void]$sb.AppendLine("- Timestamp: $($ft.Timestamp.ToString('yyyy-MM-dd HH:mm:ss'))")
            [void]$sb.AppendLine("")
        }
    }

    $sb.ToString() | Out-File -FilePath $reportPath -Encoding UTF8
    return $reportPath
}

function Write-ModuleHeader {
    param([string]$ModuleName, [string]$Description)
    Write-Host "`n========================================" -ForegroundColor Magenta
    Write-Host "Module: $ModuleName" -ForegroundColor Magenta
    Write-Host "$Description" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Magenta
}

Export-ModuleMember -Function @(
    'Set-TestBaseUrl', 'Get-TestBaseUrl',
    'Set-AdminToken', 'Get-AdminToken', 'Get-AdminRefresh',
    'Get-UserToken', 'Get-ViewerToken', 'Get-ServiceToken',
    'Add-CleanupItem',
    'Start-TestSession', 'Stop-TestSession',
    'Test-Step',
    'Invoke-ApiRequest',
    'Initialize-TestAuth',
    'Invoke-Cleanup',
    'Generate-TestReport',
    'Write-ModuleHeader'
)
