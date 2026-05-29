#!/usr/bin/env python3
"""
PTTechAI v3 - Database Initialization Script

Usage:
    python -m backend.scripts.init_db

Or from backend directory:
    python scripts/init_db.py

This script:
    1. Creates all database tables (if not exists)
    2. Initializes default admin user
    3. Initializes default permissions and role mappings
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.common.db.database import init_db, close_db, engine
from backend.scripts.init_admin import init_admin
from backend.scripts.init_permissions import init_permissions


async def main():
    print("=" * 60)
    print("PTTechAI Database Initialization")
    print("=" * 60)

    try:
        # Step 1: Create tables
        print("\n[1/3] Creating database tables...")
        await init_db()
        print("[OK] Tables created/verified")

        # Step 2: Initialize admin user
        print("\n[2/3] Initializing admin user...")
        admin = await init_admin()
        if admin:
            print(f"[OK] Admin user ready: {admin.email}")

        # Step 3: Initialize permissions
        print("\n[3/3] Initializing permissions...")
        await init_permissions()
        print("[OK] Permissions initialized")

        print("\n" + "=" * 60)
        print("Database initialization completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Initialization failed: {e}")
        sys.exit(1)
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
