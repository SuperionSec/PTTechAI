"""Audit log API — tenant-scoped listing, filtering, and export (CSV/JSON)."""
import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.permissions import require_permission_name
from backend.common.infra.rbac.access_helpers import is_platform_admin
from backend.common.models.user import User

from .models import AuditLog
from .schemas import AuditLogListResponse, AuditLogResponse

router = APIRouter()


def _audit_response(log: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=log.id,
        tenant_id=log.tenant_id,
        user_id=log.user_id,
        username=log.username,
        action=log.action,
        resource_type=log.resource_type,
        resource_id=log.resource_id,
        details=log.details,
        ip_address=log.ip_address,
        user_agent=log.user_agent,
        created_at=log.created_at.isoformat() if log.created_at else "",
    )


def _build_filters(
    current_user: User,
    action: str | None,
    resource_type: str | None,
    username: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
    tenant_id: str | None,
):
    """Build audit filters, enforcing tenant scoping.

    - Platform admin: sees all tenants; may narrow with ``tenant_id``.
    - Tenant-scoped user: forced to their own tenant regardless of the param.
    """
    filters = []
    if is_platform_admin(current_user):
        if tenant_id:
            filters.append(AuditLog.tenant_id == tenant_id)
    else:
        filters.append(AuditLog.tenant_id == getattr(current_user, "tenant_id", None))
    if action:
        filters.append(AuditLog.action == action)
    if resource_type:
        filters.append(AuditLog.resource_type == resource_type)
    if username:
        filters.append(AuditLog.username.ilike(f"%{username}%"))
    if start_date:
        filters.append(AuditLog.created_at >= start_date)
    if end_date:
        filters.append(AuditLog.created_at <= end_date)
    return filters


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    action: str | None = None,
    resource_type: str | None = None,
    username: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    tenant_id: str | None = Query(None, description="Platform admin only: narrow to a tenant"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("audit:read")),
):
    filters = _build_filters(current_user, action, resource_type, username, start_date, end_date, tenant_id)
    count_query = select(func.count(AuditLog.id)).where(*filters) if filters else select(func.count(AuditLog.id))
    query = select(AuditLog).where(*filters) if filters else select(AuditLog)

    total = await db.scalar(count_query) or 0
    result = await db.execute(
        query.order_by(AuditLog.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    logs = result.scalars().all()
    return AuditLogListResponse(logs=[_audit_response(log) for log in logs], total=total)


@router.get("/export")
async def export_audit_logs(
    format: str = Query("csv", pattern="^(csv|json)$"),
    action: str | None = None,
    resource_type: str | None = None,
    username: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    tenant_id: str | None = Query(None),
    limit: int = Query(10000, ge=1, le=100000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("audit:read")),
):
    """Export audit logs (tenant-scoped) as CSV or JSON for compliance archival."""
    filters = _build_filters(current_user, action, resource_type, username, start_date, end_date, tenant_id)
    query = select(AuditLog).where(*filters) if filters else select(AuditLog)
    result = await db.execute(query.order_by(AuditLog.created_at.desc()).limit(limit))
    logs = result.scalars().all()

    fields = ["id", "tenant_id", "user_id", "username", "action", "resource_type",
              "resource_id", "ip_address", "user_agent", "created_at", "details"]

    def _row(log: AuditLog) -> dict:
        return {
            "id": log.id, "tenant_id": log.tenant_id, "user_id": log.user_id,
            "username": log.username, "action": log.action, "resource_type": log.resource_type,
            "resource_id": log.resource_id, "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else "",
            "details": log.details,
        }

    if format == "json":
        payload = json.dumps({"logs": [_row(x) for x in logs], "count": len(logs)}, ensure_ascii=False, indent=2)
        return Response(
            content=payload, media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit-logs.json"},
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for log in logs:
        row = _row(log)
        row["details"] = json.dumps(row["details"], ensure_ascii=False) if row["details"] else ""
        writer.writerow(row)
    return Response(
        content=output.getvalue(), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-logs.csv"},
    )
