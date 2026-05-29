#!/usr/bin/env python3
"""
PTTechAI v3 - Database Setup Script

One-command initialization for new deployments:
    python -m backend.scripts.setup

This script:
    1. Checks PostgreSQL connectivity
    2. Creates database if not exists
    3. Creates all tables
    4. Initializes admin user (from env vars)
    5. Initializes RBAC permissions and role mappings

Required data only (no test data):
    - 1 admin user
    - ~30 permission definitions
    - 3 role-permission mappings (admin/user/viewer)
"""
import argparse
import asyncio
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from backend.common.config import settings
from backend.common.db.database import init_db, close_db, engine
from backend.scripts.init_admin import init_admin
from backend.scripts.init_permissions import init_permissions


def get_base_database_url() -> str:
    """Get base URL without database name for creating DB"""
    url = settings.DATABASE_URL
    # Remove database name from URL (e.g., /pttechai -> /postgres)
    parts = url.rsplit("/", 1)
    if len(parts) == 2:
        return parts[0] + "/postgres"
    return url


async def check_postgres_connection(base_url: str) -> bool:
    """Check if PostgreSQL server is reachable"""
    try:
        temp_engine = create_async_engine(base_url, echo=False, future=True)
        async with temp_engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            result.scalar()  # scalar() is sync, not awaitable
        await temp_engine.dispose()
        return True
    except Exception as e:
        print(f"[ERROR] Cannot connect to PostgreSQL: {e}")
        return False


async def create_database_if_not_exists(base_url: str, db_name: str) -> bool:
    """Create database if it doesn't exist"""
    try:
        temp_engine = create_async_engine(base_url, echo=False, future=True, isolation_level="AUTOCOMMIT")
        async with temp_engine.connect() as conn:
            result = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
                {"db_name": db_name}
            )
            exists = result.scalar_one_or_none()
            if exists:
                print(f"[OK] Database '{db_name}' already exists")
            else:
                print(f"[INFO] Creating database '{db_name}'...")
                await conn.execute(text(f'CREATE DATABASE "{db_name}"'))
                print(f"[OK] Database '{db_name}' created")
        await temp_engine.dispose()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to create database: {e}")
        return False


async def run_setup(skip_admin: bool = False, skip_permissions: bool = False):
    """Run full database setup"""
    print("=" * 60)
    print("PTTechAI Database Setup")
    print("=" * 60)

    # Parse database name from URL
    db_url = settings.DATABASE_URL
    db_name = db_url.rsplit("/", 1)[-1].split("?")[0]
    base_url = get_base_database_url()

    print(f"\nDatabase URL: {db_url}")
    print(f"Database Name: {db_name}")

    # Step 1: Check PostgreSQL connection
    print("\n[1/5] Checking PostgreSQL connection...")
    if not await check_postgres_connection(base_url):
        print("\n[FAILED] PostgreSQL is not reachable.")
        print("Hints:")
        print("  - Docker: docker compose up -d postgres")
        print("  - Local:  Ensure PostgreSQL is running on localhost:5432")
        print(f"  - Check DATABASE_URL in .env: {db_url}")
        return False
    print("[OK] PostgreSQL is reachable")

    # Step 2: Create database
    print("\n[2/5] Checking database...")
    if not await create_database_if_not_exists(base_url, db_name):
        return False

    # Step 3: Create tables
    print("\n[3/5] Creating tables...")
    try:
        await init_db()
        print("[OK] All tables created/verified")
    except Exception as e:
        print(f"[ERROR] Failed to create tables: {e}")
        traceback.print_exc()
        return False

    # Step 4: Initialize admin user
    if not skip_admin:
        print("\n[4/5] Initializing admin user...")
        admin_email = os.getenv("ADMIN_EMAIL", "admin@bctech.ai")
        try:
            admin = await init_admin()
            if admin:
                print(f"[OK] Admin user ready: {admin.email}")
            else:
                print("[WARN] Admin user initialization returned None")
        except Exception as e:
            print(f"[ERROR] Failed to initialize admin: {e}")
            traceback.print_exc()
            return False
    else:
        print("\n[4/5] Skipping admin user initialization (--skip-admin)")

    # Step 5: Initialize permissions
    if not skip_permissions:
        print("\n[5/5] Initializing permissions...")
        try:
            await init_permissions()
            print("[OK] Permissions initialized")
        except Exception as e:
            print(f"[ERROR] Failed to initialize permissions: {e}")
            traceback.print_exc()
            return False
    else:
        print("\n[5/5] Skipping permissions initialization (--skip-permissions)")

    # Cleanup
    await close_db()

    print("\n" + "=" * 60)
    print("Setup completed successfully!")
    print("=" * 60)
    print("\nYou can now start the application:")
    print("  Backend:  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000")
    print("  Frontend: cd frontend && npm run dev")
    print(f"\nDefault login: {admin_email} / (set via ADMIN_PASSWORD env var)")
    return True


def main():
    parser = argparse.ArgumentParser(description="PTTechAI Database Setup")
    parser.add_argument("--skip-admin", action="store_true", help="Skip admin user creation")
    parser.add_argument("--skip-permissions", action="store_true", help="Skip permissions initialization")
    args = parser.parse_args()

    success = asyncio.run(run_setup(skip_admin=args.skip_admin, skip_permissions=args.skip_permissions))
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
