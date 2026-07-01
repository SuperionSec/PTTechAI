"""Audit log service for system operations."""
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.models.user import User
from .models import AuditLog

SENSITIVE_KEYS = {"password", "token", "secret", "api_key", "refresh_token", "access_token", "hashed_password"}
REDACTED = "[REDACTED]"


def _sanitize_details(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if any(sensitive in key.lower() for sensitive in SENSITIVE_KEYS):
                sanitized[key] = REDACTED
            else:
                sanitized[key] = _sanitize_details(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_details(item) for item in value]
    return value


def _get_request_ip(request: Request | None) -> str | None:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def _get_user_agent(request: Request | None) -> str | None:
    if not request:
        return None
    return request.headers.get("user-agent")


async def record_audit_log(
    db: AsyncSession,
    *,
    user: User | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    request: Request | None = None,
) -> None:
    log = AuditLog(
        tenant_id=getattr(user, "tenant_id", None) if user else None,
        user_id=user.id if user else None,
        username=user.email if user else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        details=_sanitize_details(details) if details else None,
        ip_address=_get_request_ip(request),
        user_agent=_get_user_agent(request),
    )
    db.add(log)
    await db.flush()
