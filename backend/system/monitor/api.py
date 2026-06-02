"""System monitor API."""
import platform
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.auth import require_role
from backend.common.models.user import Role, User
from backend.common.config import settings

router = APIRouter()


@router.get("/health")
async def system_health(current_user: User = Depends(require_role(Role.ADMIN))):
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python": platform.python_version(),
        "platform": platform.platform(),
    }


@router.get("/database")
async def database_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN)),
):
    result = await db.execute(text("SELECT 1"))
    ok = result.scalar_one() == 1
    return {
        "status": "healthy" if ok else "unhealthy",
        "database_url_configured": bool(settings.DATABASE_URL),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
