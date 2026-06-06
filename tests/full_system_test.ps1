# PTTechAI Full System Test Suite
# Main entry point - orchestrates all module tests
#
# Usage:
#   .\tests\full_system_test.ps1                    # Run all tests
#   .\tests\full_system_test.ps1 -BaseUrl "http://localhost:8000"  # Custom base URL
#   .\tests\full_system_test.ps1 -Modules @("Auth", "RBAC")       # Run specific modules
#   .\tests\full_system_test.ps1 -SkipCleanup                     # Skip cleanup after tests

param(
    [string]$BaseUrl = "http://localhost:8000",
    [string[]]$Modules = @(),
    [switch]$SkipCleanup = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "Continue"

# Import test framework
$frameworkPath = Join-Path $PSScriptRoot "TestFramework.psm1"
Import-Module $frameworkPath -Force

# Set base URL
Set-TestBaseUrl -Url $BaseUrl

# Start test session
Start-TestSession

# Check if backend is reachable
Write-Host "`n--- Checking Backend Connectivity ---" -ForegroundColor Cyan
try {
    $healthCheck = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  Backend is reachable: $BaseUrl" -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Backend at $BaseUrl is not reachable!" -ForegroundColor Red
    Write-Host "  Make sure the backend is running before executing tests." -ForegroundColor Red
    $continue = Read-Host "  Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Test aborted." -ForegroundColor Yellow
        exit 1
    }
}

# Initialize authentication
$authOk = Initialize-TestAuth
if (-not $authOk) {
    Write-Host "FATAL: Authentication initialization failed. Cannot proceed." -ForegroundColor Red
    exit 1
}

# Define all test modules in execution order
$allTestModules = @(
    @{ Name = "Auth"; File = "Test-Auth.ps1" },
    @{ Name = "RBAC"; File = "Test-RBAC.ps1" },
    @{ Name = "Users"; File = "Test-Users.ps1" },
    @{ Name = "ApiKeys"; File = "Test-ApiKeys.ps1" },
    @{ Name = "Menus"; File = "Test-Menus.ps1" },
    @{ Name = "Audit"; File = "Test-Audit.ps1" },
    @{ Name = "Monitor"; File = "Test-Monitor.ps1" },
    @{ Name = "Dashboard"; File = "Test-Dashboard.ps1" },
    @{ Name = "Scans"; File = "Test-Scans.ps1" },
    @{ Name = "Targets"; File = "Test-Targets.ps1" },
    @{ Name = "Agent"; File = "Test-Agent.ps1" },
    @{ Name = "Reports"; File = "Test-Reports.ps1" },
    @{ Name = "VulnTypes"; File = "Test-VulnTypes.ps1" },
    @{ Name = "Prompts"; File = "Test-Prompts.ps1" },
    @{ Name = "Settings"; File = "Test-Settings.ps1" },
    @{ Name = "AgentTasks"; File = "Test-AgentTasks.ps1" },
    @{ Name = "Scheduler"; File = "Test-Scheduler.ps1" },
    @{ Name = "VulnLab"; File = "Test-VulnLab.ps1" },
    @{ Name = "Terminal"; File = "Test-Terminal.ps1" },
    @{ Name = "Sandbox"; File = "Test-Sandbox.ps1" },
    @{ Name = "Knowledge"; File = "Test-Knowledge.ps1" },
    @{ Name = "MCP"; File = "Test-MCP.ps1" },
    @{ Name = "Providers"; File = "Test-Providers.ps1" },
    @{ Name = "FullIA-CLIAgent"; File = "Test-FullIA-CLIAgent.ps1" },
    @{ Name = "VulnLibrary"; File = "Test-VulnLibrary.ps1" },
    @{ Name = "Permissions"; File = "Test-Permissions.ps1" }
)

# Filter modules if specified
$testModulesToRun = if ($Modules.Count -gt 0) {
    $allTestModules | Where-Object { $Modules -contains $_.Name }
} else {
    $allTestModules
}

# Execute each test module
$modulesDir = Join-Path $PSScriptRoot "test_modules"
$moduleResults = @()

foreach ($testModule in $testModulesToRun) {
    $moduleFile = Join-Path $modulesDir $testModule.File
    if (Test-Path $moduleFile) {
        Write-Host "`n>>>>>>>>>> Running Module: $($testModule.Name) <<<<<<<<<<" -ForegroundColor White
        try {
            . $moduleFile -Framework $null
            Write-Host "  Module $($testModule.Name) completed" -ForegroundColor Green
        } catch {
            Write-Host "  Module $($testModule.Name) encountered error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "`n  SKIP Module $($testModule.Name): File not found ($moduleFile)" -ForegroundColor Yellow
    }
}

# Cleanup
if (-not $SkipCleanup) {
    Invoke-Cleanup
} else {
    Write-Host "`n--- Cleanup Skipped ( -SkipCleanup flag ) ---" -ForegroundColor Yellow
}

# Generate report and summary
$summary = Stop-TestSession

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Test execution completed!" -ForegroundColor Green
Write-Host "Report: $($summary.ReportPath)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

# Return exit code based on results
if ($summary.Failed -gt 0 -or $summary.Errors -gt 0) {
    exit 1
} else {
    exit 0
}
