# ============================================================================
# PTTechAI 开发环境启动脚本
# 用途：检查环境依赖并启动前后端开发服务器
# 使用：.\scripts\start_dev.ps1
# ============================================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  PTTechAI Development Environment    " -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# ---------- 检查 Python 环境 ----------
Write-Host "[1/5] Checking Python environment..." -ForegroundColor Yellow

$pythonCmd = $null
if (Test-Path "$ProjectRoot\.venv\Scripts\python.exe") {
    $pythonCmd = "$ProjectRoot\.venv\Scripts\python.exe"
    Write-Host "  Found virtual environment: .venv\Scripts\python.exe" -ForegroundColor Green
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
    Write-Host "  Using system Python" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Python not found. Please install Python 3.10+ and create a virtual environment." -ForegroundColor Red
    Write-Host "  Run: python -m venv .venv" -ForegroundColor Red
    exit 1
}

$pyVersion = & $pythonCmd --version 2>&1
Write-Host "  Python version: $pyVersion" -ForegroundColor Gray

# 检查关键 Python 包
$requiredPkgs = @("fastapi", "uvicorn", "sqlalchemy")
$missingPkgs = @()
foreach ($pkg in $requiredPkgs) {
    $result = & $pythonCmd -c "import $pkg; print($pkg.__version__)" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $missingPkgs += $pkg
    }
}
if ($missingPkgs.Count -gt 0) {
    Write-Host "  WARNING: Missing Python packages: $($missingPkgs -join ', ')" -ForegroundColor Yellow
    Write-Host "  Run: $pythonCmd -m pip install -r backend\requirements.txt" -ForegroundColor Yellow
} else {
    Write-Host "  Core Python packages OK" -ForegroundColor Green
}

# ---------- 检查 Node.js 环境 ----------
Write-Host ""
Write-Host "[2/5] Checking Node.js environment..." -ForegroundColor Yellow

if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeVersion = node --version
    Write-Host "  Node.js version: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Node.js not found. Please install Node.js 18+." -ForegroundColor Red
    exit 1
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmVersion = npm --version
    Write-Host "  npm version: $npmVersion" -ForegroundColor Green
} else {
    Write-Host "  ERROR: npm not found." -ForegroundColor Red
    exit 1
}

# 检查前端依赖是否安装
if (-not (Test-Path "$ProjectRoot\frontend\node_modules")) {
    Write-Host "  WARNING: frontend/node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    Push-Location "$ProjectRoot\frontend"
    npm install
    Pop-Location
} else {
    Write-Host "  Frontend dependencies OK" -ForegroundColor Green
}

# ---------- 检查 .env 文件 ----------
Write-Host ""
Write-Host "[3/5] Checking environment configuration..." -ForegroundColor Yellow

if (Test-Path "$ProjectRoot\.env") {
    Write-Host "  .env file found" -ForegroundColor Green
} else {
    Write-Host "  WARNING: .env file not found. Copy from .env.example and configure." -ForegroundColor Yellow
    if (Test-Path "$ProjectRoot\.env.example") {
        Write-Host "  You can run: copy .env.example .env" -ForegroundColor Yellow
    }
}

# ---------- 启动后端 ----------
Write-Host ""
Write-Host "[4/5] Starting backend server (uvicorn)..." -ForegroundColor Yellow

$backendDir = "$ProjectRoot\backend"
if (-not (Test-Path $backendDir)) {
    Write-Host "  ERROR: Backend directory not found at $backendDir" -ForegroundColor Red
    exit 1
}

# 使用 Start-Process 在新窗口启动后端
$backendProc = Start-Process -FilePath $pythonCmd -ArgumentList "-m", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8000" -WorkingDirectory $backendDir -PassThru -WindowStyle Normal

Write-Host "  Backend PID: $($backendProc.Id)" -ForegroundColor Green
Write-Host "  Backend URL: http://localhost:8000" -ForegroundColor Green
Write-Host "  API docs:    http://localhost:8000/docs" -ForegroundColor Green

# ---------- 启动前端 ----------
Write-Host ""
Write-Host "[5/5] Starting frontend dev server (Vite)..." -ForegroundColor Yellow

$frontendDir = "$ProjectRoot\frontend"
if (-not (Test-Path $frontendDir)) {
    Write-Host "  ERROR: Frontend directory not found at $frontendDir" -ForegroundColor Red
    # 清理后端进程
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

$frontendProc = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $frontendDir -PassThru -WindowStyle Normal

Write-Host "  Frontend PID: $($frontendProc.Id)" -ForegroundColor Green

# ---------- 输出访问信息 ----------
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  PTTechAI is running!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Backend PID:  $($backendProc.Id)" -ForegroundColor Gray
Write-Host "  Frontend PID: $($frontendProc.Id)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers, or close the terminal windows." -ForegroundColor Yellow
Write-Host ""

# 保存 PID 到文件以便后续停止
@{
    backend_pid  = $backendProc.Id
    frontend_pid = $frontendProc.Id
} | ConvertTo-Json | Set-Content "$ProjectRoot\scripts\.dev_pids.json" -ErrorAction SilentlyContinue

Write-Host "  PIDs saved to scripts\.dev_pids.json" -ForegroundColor Gray
Write-Host "  To stop servers: .\scripts\stop_dev.ps1" -ForegroundColor Gray
Write-Host ""
