"""Online session management — list active sessions and force-logout.

Reuses the existing ``user_tokens`` table (access tokens). Tenant-scoped:
platform admin sees all sessions; tenant admin sees only their tenant's users.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.permissions import require_permission_name
from backend.common.infra.rbac.access_helpers import is_platform_admin
from backend.common.models.user import User, UserToken
from backend.system.audit.service import record_audit_log

router = APIRouter()


@router.get("/sessions")
async def list_sessions(
    current_user: User = Depends(require_permission_name("session:manage")),
    db: AsyncSession = Depends(get_db),
):
    """List active (non-revoked, unexpired) access-token sessions.

    Platform admin sees every tenant; tenant admin is limited to users in their
    own tenant.
    """
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    query = (
        select(UserToken, User)
        .join(User, UserToken.user_id == User.id)
        .where(
            UserToken.token_type == "access",
            UserToken.is_revoked.is_(False),
            UserToken.expires_at > now,
        )
        .order_by(UserToken.last_used_at.desc().nullslast(), UserToken.created_at.desc())
    )
    if not is_platform_admin(current_user):
        query = query.where(User.tenant_id == getattr(current_user, "tenant_id", None))

    rows = (await db.execute(query)).all()
    sessions = [
        {
            "jti": token.token_jti,
            "user_id": user.id,
            "username": user.email,
            "full_name": user.full_name,
            "tenant_id": user.tenant_id,
            "ip_address": token.ip_address,
            "device_info": token.device_info,
            "login_method": token.login_method,
            "created_at": token.created_at.isoformat() if token.created_at else None,
            "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
            "expires_at": token.expires_at.isoformat() if token.expires_at else None,
            "is_current": False,
        }
        for token, user in rows
    ]
    return {"sessions": sessions, "total": len(sessions)}


@router.delete("/sessions/{jti}", status_code=status.HTTP_200_OK)
async def force_logout(
    jti: str,
    request: Request,
    current_user: User = Depends(require_permission_name("session:manage")),
    db: AsyncSession = Depends(get_db),
):
    """Force-logout a session by revoking its access token (RuoYi 强退)."""
    token = (await db.execute(select(UserToken).where(UserToken.token_jti == jti))).scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Session not found")

    # Tenant admins may only revoke sessions of users in their own tenant.
    if not is_platform_admin(current_user):
        owner = await db.get(User, token.user_id)
        if not owner or owner.tenant_id != getattr(current_user, "tenant_id", None):
            raise HTTPException(status_code=404, detail="Session not found")

    token.is_revoked = True
    from datetime import datetime, timezone
    token.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await record_audit_log(
        db, user=current_user, action="session.force_logout",
        resource_type="session", resource_id=jti,
        details={"target_user_id": token.user_id}, request=request,
    )
    await db.commit()
    return {"message": "Session terminated", "jti": jti}
