# ============================================================================
# PTTechAI 迁移完整性检查脚本
# 用途：检查 NeuroSploit → PTTechAI 移植后的文件完整性和权限配置
# 使用：.\scripts\check_migration.ps1
# ============================================================================

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

# 统计变量
$script:TotalChecks = 0
$script:PassedChecks = 0
$script:FailedChecks = 0
$script:Warnings = 0

function Check-File {
    param(
        [string]$FilePath,
        [string]$Description
    )
    $script:TotalChecks++
    $fullPath = Join-Path $ProjectRoot $FilePath
    if (Test-Path $fullPath) {
        Write-Host "  [OK] $Description" -ForegroundColor Green
        $script:PassedChecks++
    } else {
        Write-Host "  [MISSING] $Description -- $FilePath" -ForegroundColor Red
        $script:FailedChecks++
    }
}

function Check-FileContent {
    param(
        [string]$FilePath,
        [string]$Pattern,
        [string]$Description
    )
    $script:TotalChecks++
    $fullPath = Join-Path $ProjectRoot $FilePath
    if (-not (Test-Path $fullPath)) {
        Write-Host "  [SKIP] $Description -- file not found: $FilePath" -ForegroundColor Yellow
        $script:Warnings++
        return
    }
    $content = Get-Content $fullPath -Raw -ErrorAction SilentlyContinue
    if ($content -match $Pattern) {
        Write-Host "  [OK] $Description" -ForegroundColor Green
        $script:PassedChecks++
    } else {
        Write-Host "  [FAIL] $Description -- pattern not found in $FilePath" -ForegroundColor Red
        $script:FailedChecks++
    }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  PTTechAI Migration Completeness Check       " -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# ======================================================================
# 1. 后端 API 路由文件检查 (18个)
# ======================================================================
Write-Host "=== 1. Backend API Routes (18 files) ===" -ForegroundColor Cyan

$apiRoutes = @(
    "backend\pentest\backend\api\v1\agent.py",
    "backend\pentest\backend\api\v1\agent_tasks.py",
    "backend\pentest\backend\api\v1\cli_agent.py",
    "backend\pentest\backend\api\v1\dashboard.py",
    "backend\pentest\backend\api\v1\full_ia.py",
    "backend\pentest\backend\api\v1\knowledge.py",
    "backend\pentest\backend\api\v1\mcp.py",
    "backend\pentest\backend\api\v1\prompts.py",
    "backend\pentest\backend\api\v1\providers.py",
    "backend\pentest\backend\api\v1\reports.py",
    "backend\pentest\backend\api\v1\sandbox.py",
    "backend\pentest\backend\api\v1\scans.py",
    "backend\pentest\backend\api\v1\scheduler.py",
    "backend\pentest\backend\api\v1\settings.py",
    "backend\pentest\backend\api\v1\targets.py",
    "backend\pentest\backend\api\__init__.py",
    "backend\pentest\backend\api\v1\__init__.py",
    "backend\pentest\backend\api\v1\__init__.py"
)

# 修正：去重后检查实际15个唯一路由文件 + 3个__init__
$uniqueRoutes = $apiRoutes | Select-Object -Unique
$routeCount = 0
foreach ($route in $uniqueRoutes) {
    $routeCount++
    Check-File -FilePath $route -Description "API route $routeCount : $(Split-Path $route -Leaf)"
}

Write-Host ""

# ======================================================================
# 2. 后端数据模型文件检查 (9个)
# ======================================================================
Write-Host "=== 2. Backend Models (9 files) ===" -ForegroundColor Cyan

$models = @(
    "backend\pentest\backend\models\__init__.py",
    "backend\pentest\backend\models\agent_task.py",
    "backend\pentest\backend\models\endpoint.py",
    "backend\pentest\backend\models\prompt.py",
    "backend\pentest\backend\models\report.py",
    "backend\pentest\backend\models\scan.py",
    "backend\pentest\backend\models\target.py",
    "backend\pentest\backend\models\vuln_lab.py",
    "backend\pentest\backend\models\vulnerability.py"
)

$modelCount = 0
foreach ($model in $models) {
    $modelCount++
    Check-File -FilePath $model -Description "Model $modelCount : $(Split-Path $model -Leaf)"
}

Write-Host ""

# ======================================================================
# 3. 核心引擎文件检查
# ======================================================================
Write-Host "=== 3. Core Engine Files ===" -ForegroundColor Cyan

$coreFiles = @(
    "backend\pentest\core\llm_manager.py",
    "backend\pentest\core\model_router.py",
    "backend\pentest\core\pentest_executor.py",
    "backend\pentest\core\report_generator.py",
    "backend\pentest\core\sandbox_manager.py",
    "backend\pentest\core\container_pool.py",
    "backend\pentest\core\kali_sandbox.py",
    "backend\pentest\core\scheduler.py",
    "backend\pentest\core\context_builder.py",
    "backend\pentest\core\knowledge_augmentor.py",
    "backend\pentest\core\tool_registry.py",
    "backend\pentest\core\tool_installer.py",
    "backend\pentest\core\browser_validator.py",
    "backend\pentest\core\mcp_client.py",
    "backend\pentest\core\mcp_server.py"
)

$coreCount = 0
foreach ($core in $coreFiles) {
    $coreCount++
    Check-File -FilePath $core -Description "Core $coreCount : $(Split-Path $core -Leaf)"
}

# Agent 文件
Write-Host "  --- Agent Files ---" -ForegroundColor DarkCyan
$agentFiles = @(
    "backend\pentest\agents\base_agent.py",
    "backend\pentest\agents\exploitation_agent.py",
    "backend\pentest\agents\lateral_agent.py",
    "backend\pentest\agents\network_recon_agent.py",
    "backend\pentest\agents\persistence_agent.py",
    "backend\pentest\agents\privesc_agent.py",
    "backend\pentest\agents\web_pentest_agent.py"
)

$agentCount = 0
foreach ($agent in $agentFiles) {
    $agentCount++
    Check-File -FilePath $agent -Description "Agent $agentCount : $(Split-Path $agent -Leaf)"
}

# 服务文件
Write-Host "  --- Service Files ---" -ForegroundColor DarkCyan
Check-File -FilePath "backend\pentest\backend\services\scan_service.py" -Description "Service: scan_service.py"
Check-File -FilePath "backend\pentest\backend\services\report_service.py" -Description "Service: report_service.py"

Write-Host ""

# ======================================================================
# 4. 前端页面文件检查 (18个移植页面)
# ======================================================================
Write-Host "=== 4. Frontend Pages (18 migrated pages) ===" -ForegroundColor Cyan

$frontendPages = @(
    "frontend\src\pages\AgentStatusPage.tsx",
    "frontend\src\pages\AutoPentestPage.tsx",
    "frontend\src\pages\FullIATestingPage.tsx",
    "frontend\src\pages\HomePage.tsx",
    "frontend\src\pages\KnowledgePage.tsx",
    "frontend\src\pages\MCPManagementPage.tsx",
    "frontend\src\pages\NewScanPage.tsx",
    "frontend\src\pages\ProvidersPage.tsx",
    "frontend\src\pages\RealtimeTaskPage.tsx",
    "frontend\src\pages\ReportViewPage.tsx",
    "frontend\src\pages\ReportsPage.tsx",
    "frontend\src\pages\SandboxDashboardPage.tsx",
    "frontend\src\pages\ScanDetailsPage.tsx",
    "frontend\src\pages\SchedulerPage.tsx",
    "frontend\src\pages\SettingsPage.tsx",
    "frontend\src\pages\TaskLibraryPage.tsx",
    "frontend\src\pages\TerminalAgentPage.tsx",
    "frontend\src\pages\VulnLabPage.tsx"
)

$pageCount = 0
foreach ($page in $frontendPages) {
    $pageCount++
    Check-File -FilePath $page -Description "Page $pageCount : $(Split-Path $page -Leaf)"
}

Write-Host ""

# ======================================================================
# 5. 权限装饰器检查
# ======================================================================
Write-Host "=== 5. Permission Decorators ===" -ForegroundColor Cyan

# 检查权限函数定义
$permissions = @(
    "require_scan_create",
    "require_scan_read",
    "require_scan_update",
    "require_scan_delete",
    "require_scan_execute",
    "require_report_read",
    "require_report_create",
    "require_report_delete",
    "require_dashboard_read",
    "require_agent_read",
    "require_agent_execute",
    "require_target_read",
    "require_target_create",
    "require_target_delete",
    "require_vulnerability_read",
    "require_knowledge_read",
    "require_knowledge_manage",
    "require_provider_read",
    "require_provider_manage"
)

foreach ($perm in $permissions) {
    Check-FileContent -FilePath "backend\common\infra\permissions.py" -Pattern $perm -Description "Permission: $perm"
}

Write-Host ""

# ======================================================================
# 6. 关键权限装饰器应用检查（API路由中）
# ======================================================================
Write-Host "=== 6. Permission Decorator Application ===" -ForegroundColor Cyan

# 检查关键路由文件中的权限装饰器应用
$permChecks = @(
    @{ File = "backend\pentest\backend\api\v1\cli_agent.py"; Pattern = "require_(agent|provider)_read"; Desc = "cli_agent.py: provider/agent read permissions" },
    @{ File = "backend\pentest\backend\api\v1\knowledge.py"; Pattern = "require_knowledge_(manage|write)"; Desc = "knowledge.py: write operations use manage permission" },
    @{ File = "backend\pentest\backend\api\v1\reports.py"; Pattern = "require_report_delete"; Desc = "reports.py: DELETE endpoint has report_delete permission" },
    @{ File = "backend\pentest\backend\api\v1\scans.py"; Pattern = "require_scan_(create|read|execute)"; Desc = "scans.py: scan CRUD permissions applied" },
    @{ File = "backend\pentest\backend\api\v1\agent.py"; Pattern = "require_agent_(read|execute)"; Desc = "agent.py: agent permissions applied" },
    @{ File = "backend\pentest\backend\api\v1\targets.py"; Pattern = "require_target_(read|create|delete)"; Desc = "targets.py: target permissions applied" },
    @{ File = "backend\pentest\backend\api\v1\dashboard.py"; Pattern = "require_dashboard_read"; Desc = "dashboard.py: dashboard read permission applied" }
)

foreach ($check in $permChecks) {
    Check-FileContent -FilePath $check.File -Pattern $check.Pattern -Description $check.Desc
}

Write-Host ""

# ======================================================================
# 7. 关键模型字段检查
# ======================================================================
Write-Host "=== 7. Key Model Fields ===" -ForegroundColor Cyan

$modelFieldChecks = @(
    @{ File = "backend\pentest\backend\models\vulnerability.py"; Pattern = "user_id"; Desc = "Vulnerability model: user_id field present" },
    @{ File = "backend\pentest\backend\models\scan.py"; Pattern = "user_id"; Desc = "Scan model: user_id field present" },
    @{ File = "backend\pentest\backend\models\target.py"; Pattern = "user_id"; Desc = "Target model: user_id field present" },
    @{ File = "backend\pentest\backend\models\prompt.py"; Pattern = "user_id"; Desc = "Prompt model: user_id field present" },
    @{ File = "backend\pentest\backend\models\agent_task.py"; Pattern = "user_id"; Desc = "AgentTask model: user_id field present" }
)

foreach ($check in $modelFieldChecks) {
    Check-FileContent -FilePath $check.File -Pattern $check.Pattern -Description $check.Desc
}

Write-Host ""

# ======================================================================
# 结果汇总
# ======================================================================
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Check Summary" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Total checks:  $script:TotalChecks" -ForegroundColor White
Write-Host "  Passed:        $script:PassedChecks" -ForegroundColor Green
Write-Host "  Failed:        $script:FailedChecks" -ForegroundColor Red
Write-Host "  Warnings:      $script:Warnings" -ForegroundColor Yellow
Write-Host ""

$passRate = 0
if ($script:TotalChecks -gt 0) {
    $passRate = [math]::Round(($script:PassedChecks / $script:TotalChecks) * 100, 1)
}

Write-Host "  Pass rate:     $passRate%" -ForegroundColor $(if ($passRate -ge 95) { "Green" } elseif ($passRate -ge 80) { "Yellow" } else { "Red" })
Write-Host ""

if ($script:FailedChecks -eq 0) {
    Write-Host "  RESULT: ALL CHECKS PASSED - Migration is complete!" -ForegroundColor Green
} elseif ($script:FailedChecks -le 3) {
    Write-Host "  RESULT: MINOR ISSUES - Migration mostly complete, check failed items above." -ForegroundColor Yellow
} else {
    Write-Host "  RESULT: SIGNIFICANT ISSUES - Migration incomplete, review failed items above." -ForegroundColor Red
}

Write-Host ""
Write-Host "  Report generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""
