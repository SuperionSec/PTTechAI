"""Initialize default admin user for PTTechAI"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select
from backend.common.db.database import async_session_factory
from backend.common.models.user import User, RoleModel
from backend.common.infra.auth import get_password_hash, verify_password


async def init_admin():
    admin_email = os.getenv("ADMIN_EMAIL", "admin@bctech.ai")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
    admin_name = os.getenv("ADMIN_NAME", "Admin")

    async with async_session_factory() as db:
        role_model = await db.scalar(select(RoleModel).where(RoleModel.name == "admin"))
        if not role_model:
            role_model = RoleModel(
                name="admin",
                display_name="Administrator",
                description="Full system administrator",
                is_system=False,
                is_active=True,
            )
            db.add(role_model)
            await db.flush()

        result = await db.execute(select(User).where(User.email == admin_email))
        existing = result.scalar_one_or_none()

        if existing:
            role_model = await db.scalar(select(RoleModel).where(RoleModel.name == "admin"))
            if role_model and existing.role_id is None:
                existing.role_id = role_model.id
                await db.commit()

            # Check if password matches .env config; update if changed
            if not verify_password(admin_password, existing.hashed_password):
                print(f"[INFO] Admin user '{admin_email}' password mismatch, updating...")
                existing.hashed_password = get_password_hash(admin_password)
                await db.commit()
                print(f"[OK] Admin user password updated: {admin_email}")
            else:
                print(f"[INFO] Admin user '{admin_email}' already exists")
            return existing

        admin = User(
            email=admin_email,
            hashed_password=get_password_hash(admin_password),
            full_name=admin_name,
            role_id=role_model.id,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        print(f"[OK] Admin user created: {admin_email}")
        return admin


if __name__ == "__main__":
    asyncio.run(init_admin())
