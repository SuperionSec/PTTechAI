#!/bin/bash
# PTTechAI v3 - One-Click Setup Script (Linux/Mac)
# Usage: ./scripts/setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

echo "========================================"
echo "PTTechAI v3 - Setup Script"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Python version
PYTHON_VERSION=$(python3 --version 2>/dev/null | awk '{print $2}' | cut -d. -f1,2)
if [ -z "$PYTHON_VERSION" ]; then
    echo -e "${RED}[ERROR] Python 3 not found. Please install Python 3.10+${NC}"
    exit 1
fi
REQUIRED="3.10"
if [ "$(printf '%s\n' "$REQUIRED" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED" ]; then
    echo -e "${RED}[ERROR] Python $PYTHON_VERSION found, but 3.10+ is required${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Python $PYTHON_VERSION${NC}"

# Check Node.js
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//')
if [ -z "$NODE_VERSION" ]; then
    echo -e "${YELLOW}[WARN] Node.js not found. Frontend will not be available${NC}"
else
    echo -e "${GREEN}[OK] Node.js $NODE_VERSION${NC}"
fi

# Check Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}[OK] Docker found${NC}"
    DOCKER_AVAILABLE=true
else
    echo -e "${YELLOW}[WARN] Docker not found. PostgreSQL must be running manually${NC}"
    DOCKER_AVAILABLE=false
fi

# Check .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[INFO] Creating .env from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}[WARN] Please edit .env to set your API keys and admin password${NC}"
fi

# Start PostgreSQL via Docker if available
if [ "$DOCKER_AVAILABLE" = true ]; then
    echo ""
    echo "[1/4] Starting PostgreSQL..."
    if docker compose -p pttechai -f deploy/docker-compose.yml ps postgres | grep -q "running"; then
        echo -e "${GREEN}[OK] PostgreSQL already running${NC}"
    else
        docker compose -p pttechai -f deploy/docker-compose.yml up -d postgres
        echo -e "${GREEN}[OK] PostgreSQL started${NC}"
    fi

    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker compose -p pttechai -f deploy/docker-compose.yml exec -T postgres pg_isready -U pttechai -d pttechai > /dev/null 2>&1; then
            echo -e "${GREEN}[OK] PostgreSQL is ready${NC}"
            break
        fi
        sleep 1
    done
else
    echo -e "${YELLOW}[WARN] Skipping Docker PostgreSQL startup${NC}"
    echo "Ensure PostgreSQL is running and DATABASE_URL is correct in .env"
fi

# Install backend dependencies
echo ""
echo "[2/4] Installing backend dependencies..."
pip install -r backend/requirements.txt > /dev/null 2>&1
echo -e "${GREEN}[OK] Backend dependencies installed${NC}"

# Run database setup
echo ""
echo "[3/4] Initializing database..."
python -m backend.scripts.setup

# Install frontend dependencies
echo ""
if [ -n "$NODE_VERSION" ]; then
    echo "[4/4] Installing frontend dependencies..."
    cd frontend
    npm install > /dev/null 2>&1
    echo -e "${GREEN}[OK] Frontend dependencies installed${NC}"
    cd ..
else
    echo "[4/4] Skipping frontend (Node.js not found)"
fi

# Summary
echo ""
echo "========================================"
echo -e "${GREEN}Setup completed!${NC}"
echo "========================================"
echo ""
echo "Start the application:"
echo "  Backend:  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000"
echo "  Frontend: cd frontend && npm run dev"
echo ""
echo "Default login:"
echo "  Email:    admin@bctech.ai (or your ADMIN_EMAIL)"
echo "  Password: (set via ADMIN_PASSWORD in .env)"
echo ""
