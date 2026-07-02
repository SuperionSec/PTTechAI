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
    4. Initializes vulnerability-library categories
    5. Initializes sidebar menus (4 groups: pentest, apptest, vulnLibrary, system)

Note: table creation uses SQLAlchemy metadata (create_all). Row-Level Security
policies for multi-tenant isolation are applied by Alembic migration
20260701_0002 — run `alembic upgrade head` on the target database as well,
and connect the app with a non-superuser role for RLS to take effect
(see doc/multi-tenant.md §6.2).
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.common.db.database import init_db, close_db, engine
from backend.scripts.init_admin import init_admin
from backend.scripts.init_permissions import init_permissions
from backend.scripts.init_menus import init_menus
from backend.scripts.init_vuln_library_categories import init_vuln_library_categories


async def main():
    print("=" * 60)
    print("PTTechAI Database Initialization")
    print("=" * 60)

    try:
        # Step 1: Create tables
        print("\n[1/5] Creating database tables...")
        await init_db()
        print("[OK] Tables created/verified")

        # Step 2: Initialize admin user
        print("\n[2/5] Initializing admin user...")
        admin = await init_admin()
        if admin:
            print(f"[OK] Admin user ready: {admin.email}")

        # Step 3: Initialize permissions
        print("\n[3/5] Initializing permissions...")
        await init_permissions()
        print("[OK] Permissions initialized")

        from backend.common.db.database import async_session_factory

        # Step 4: Initialize vulnerability-library categories
        print("\n[4/5] Initializing vulnerability-library categories...")
        async with async_session_factory() as session:
            vuln_count = await init_vuln_library_categories(session)
        print(f"[OK] Vulnerability-library categories initialized ({vuln_count} created)")

        # Step 5: Initialize menus
        print("\n[5/5] Initializing menus...")
        async with async_session_factory() as session:
            created = await init_menus(session)
        print(f"[OK] Menus initialized ({created} new menus created)")

        print("\n" + "=" * 60)
        print("Database initialization completed successfully!")
        print("Reminder: run `alembic upgrade head` to apply RLS policies.")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] Initialization failed: {e}")
        sys.exit(1)
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
