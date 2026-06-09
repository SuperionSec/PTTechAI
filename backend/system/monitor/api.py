"""System monitor API."""
import platform
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.auth import get_current_user
from backend.common.infra.permissions import require_permission_name
from backend.common.models.user import User
from backend.common.config import settings

router = APIRouter()


@router.get("/health")
async def system_health(current_user: User = Depends(get_current_user)):
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "debug": settings.DEBUG,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "python": f"{platform.python_version_tuple()[0]}.{platform.python_version_tuple()[1]}",
        "platform": platform.system(),
    }


@router.get("/database")
async def database_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    result = await db.execute(text("SELECT 1"))
    ok = result.scalar_one() == 1
    return {
        "status": "healthy" if ok else "unhealthy",
        "database_url_configured": bool(settings.DATABASE_URL),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
