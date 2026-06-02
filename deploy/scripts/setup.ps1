# PTTechAI v3 - One-Click Setup Script (Windows)
# Usage: .\scripts\setup.ps1

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")
Set-Location $ProjectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "PTTechAI v3 - Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Check Python version
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    Write-Host "[ERROR] Python not found. Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

$pythonVersion = & $pythonCmd.Source --version 2>&1
$versionMatch = $pythonVersion -match "Python (\d+)\.(\d+)"
if (-not $versionMatch) {
    Write-Host "[ERROR] Could not detect Python version" -ForegroundColor Red
    exit 1
}
$major = [int]$matches[1]
$minor = [int]$matches[2]
if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
    Write-Host "[ERROR] Python $major.$minor found, but 3.10+ is required" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Python $major.$minor" -ForegroundColor Green

# Check Node.js
$nodeVersion = $null
try {
    $nodeVersion = & node --version 2>$null
} catch {}
if ($nodeVersion) {
    Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "[WARN] Node.js not found. Frontend will not be available" -ForegroundColor Yellow
}

# Check Docker
$dockerAvailable = $false
try {
    $dockerVersion = & docker --version 2>$null
    if ($dockerVersion) {
        Write-Host "[OK] Docker found" -ForegroundColor Green
        $dockerAvailable = $true
    }
} catch {
    Write-Host "[WARN] Docker not found. PostgreSQL must be running manually" -ForegroundColor Yellow
}

# Check .env
if (-not (Test-Path ".env")) {
    Write-Host "[INFO] Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "[WARN] Please edit .env to set your API keys and admin password" -ForegroundColor Yellow
}

# Start PostgreSQL via Docker if available
if ($dockerAvailable) {
    Write-Host ""
    Write-Host "[1/4] Starting PostgreSQL..."
    $postgresRunning = docker compose -p pttechai -f deploy/docker-compose.yml ps postgres 2>$null | Select-String "running"
    if ($postgresRunning) {
        Write-Host "[OK] PostgreSQL already running" -ForegroundColor Green
    } else {
        docker compose -p pttechai -f deploy/docker-compose.yml up -d postgres
        Write-Host "[OK] PostgreSQL started" -ForegroundColor Green
    }

    # Wait for PostgreSQL
    Write-Host "Waiting for PostgreSQL to be ready..."
    for ($i = 1; $i -le 30; $i++) {
        $ready = docker compose -p pttechai -f deploy/docker-compose.yml exec -T postgres pg_isready -U pttechai -d pttechai 2>$null
        if ($ready -match "accepting connections") {
            Write-Host "[OK] PostgreSQL is ready" -ForegroundColor Green
            break
        }
        Start-Sleep -Seconds 1
    }
} else {
    Write-Host "[WARN] Skipping Docker PostgreSQL startup" -ForegroundColor Yellow
    Write-Host "Ensure PostgreSQL is running and DATABASE_URL is correct in .env"
}

# Install backend dependencies
Write-Host ""
Write-Host "[2/4] Installing backend dependencies..."
& $pythonCmd.Source -m pip install -r backend/requirements.txt | Out-Null
Write-Host "[OK] Backend dependencies installed" -ForegroundColor Green

# Run database setup
Write-Host ""
Write-Host "[3/4] Initializing database..."
& $pythonCmd.Source -m backend.scripts.setup

# Install frontend dependencies
Write-Host ""
if ($nodeVersion) {
    Write-Host "[4/4] Installing frontend dependencies..."
    Set-Location frontend
    & npm install | Out-Null
    Write-Host "[OK] Frontend dependencies installed" -ForegroundColor Green
    Set-Location ..
} else {
    Write-Host "[4/4] Skipping frontend (Node.js not found)"
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Setup completed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Start the application:"
Write-Host "  Backend:  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"
Write-Host "  Frontend: cd frontend; npm run dev"
Write-Host ""
Write-Host "Default login:"
Write-Host "  Email:    admin@bctech.ai (or your ADMIN_EMAIL)"
Write-Host "  Password: (set via ADMIN_PASSWORD in .env)"
Write-Host ""
