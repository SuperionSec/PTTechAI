"""Organization Management API (Tenant + Department CRUD)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.infra.auth import get_current_user
from backend.common.infra.permissions import require_permission_name
from backend.common.infra.tenant_context import get_tenant_context
from backend.common.models.user import User
from backend.system.audit.service import record_audit_log
from backend.system.organization.models import Department
from backend.system.organization.schemas import (
    DepartmentCreate,
    DepartmentNode,
    DepartmentTreeResponse,
    DepartmentUpdate,
    SetTenantAdminRequest,
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)
from backend.system.organization.service import (
    create_department,
    create_tenant,
    delete_department,
    delete_tenant,
    get_tenant,
    list_departments_tree,
    list_tenants,
    set_tenant_admin as service_set_tenant_admin,
    update_department,
    update_tenant,
)

router = APIRouter()


# ──────────────────────────────
#  Tenant endpoints
#  Platform super-admin only (tenant:manage)
# ──────────────────────────────


@router.get("/tenants", response_model=TenantListResponse)
async def get_tenants(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """List all tenants (platform admin only)."""
    return await list_tenants(db, skip=skip, limit=limit, search=search)


@router.get("/tenants/{tenant_id}", response_model=TenantResponse)
async def get_tenant_by_id(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """Get a single tenant (platform admin only)."""
    tenant = await get_tenant(db, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    # Build response with counts
    from sqlalchemy import func, select
    from backend.common.models.user import User
    user_count = await db.scalar(
        select(func.count()).select_from(User).where(User.tenant_id == tenant.id)
    ) or 0
    dept_count = await db.scalar(
        select(func.count())
        .select_from(Department)
        .where(Department.tenant_id == tenant.id)
    ) or 0
    r = TenantResponse(**tenant.to_dict(), user_count=user_count, department_count=dept_count)
    return r


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def post_tenant(
    data: TenantCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """Create a new tenant (platform admin only)."""
    tenant = await create_tenant(db, data)
    await db.commit()
    await db.refresh(tenant)
    await record_audit_log(
        db, user=current_user, action="tenant.create",
        resource_type="tenant", resource_id=tenant.id,
        details={"code": tenant.code, "name": tenant.name}, request=request,
    )
    r = TenantResponse(**tenant.to_dict(), user_count=0, department_count=1)
    return r


@router.put("/tenants/{tenant_id}", response_model=TenantResponse)
async def put_tenant(
    tenant_id: str,
    data: TenantUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """Update a tenant (platform admin only)."""
    tenant = await update_tenant(db, tenant_id, data)
    await db.commit()
    await db.refresh(tenant)
    await record_audit_log(
        db, user=current_user, action="tenant.update",
        resource_type="tenant", resource_id=tenant.id,
        details={k: v for k, v in data.model_dump(exclude_unset=True).items()}, request=request,
    )
    r = TenantResponse(**tenant.to_dict(), user_count=0, department_count=0)
    return r


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def suspend_tenant(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """Suspend a tenant (soft-delete, preserves data for audit)."""
    await delete_tenant(db, tenant_id)
    await db.commit()
    await record_audit_log(
        db, user=current_user, action="tenant.suspend",
        resource_type="tenant", resource_id=tenant_id,
        details={}, request=request,
    )


@router.post("/tenants/{tenant_id}/admins", status_code=status.HTTP_200_OK)
async def set_admin(
    tenant_id: str,
    body: SetTenantAdminRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("tenant:manage")),
):
    """Promote/demote a user as tenant-administrator."""
    user = await service_set_tenant_admin(db, tenant_id, body.user_id, is_tenant_admin=body.is_tenant_admin)
    await db.commit()
    await record_audit_log(
        db, user=current_user, action="tenant.set_admin",
        resource_type="user", resource_id=user.id,
        details={"tenant_id": tenant_id}, request=request,
    )
    return {"message": "Tenant administrator updated", "user_id": user.id}


# ──────────────────────────────
#  Department endpoints
#  org:manage for CRUD, org:read for tree view
#  Scoped to current user's tenant (platform admin can pass ?tenant_id=…)
# ──────────────────────────────


@router.get("/departments/tree", response_model=DepartmentTreeResponse)
async def get_department_tree(
    tenant_id: Optional[str] = Query(None, description="Override tenant (platform admin only)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get department tree for the current user's tenant.

    Platform admins can optionally pass ``?tenant_id=…`` to view another
    tenant's department tree (requires ``tenant:manage`` permission).
    """
    ctx = get_tenant_context()
    if tenant_id and ctx and ctx.is_platform_admin:
        pass  # platform admin viewing another tenant
    elif tenant_id:
        raise HTTPException(status_code=403, detail="Not allowed to specify tenant_id")
    else:
        tenant_id = getattr(current_user, "tenant_id", None) if ctx is None else ctx.tenant_id
        if not tenant_id:
            return DepartmentTreeResponse(departments=[], total=0)

    return await list_departments_tree(db, ctx, tenant_id=tenant_id)


@router.post("/departments", response_model=DepartmentNode, status_code=status.HTTP_201_CREATED)
async def post_department(
    data: DepartmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("org:manage")),
):
    """Create a department within the current tenant."""
    ctx = get_tenant_context()
    dept = await create_department(db, data, ctx)
    await db.commit()
    await db.refresh(dept)
    await record_audit_log(
        db, user=current_user, action="department.create",
        resource_type="department", resource_id=dept.id,
        details={"name": dept.name, "tenant_id": dept.tenant_id}, request=request,
    )
    return DepartmentNode(
        id=dept.id, tenant_id=dept.tenant_id, parent_id=dept.parent_id,
        name=dept.name, sort_order=dept.sort_order, description=dept.description,
        is_active=dept.is_active,
    )


@router.put("/departments/{dept_id}", response_model=DepartmentNode)
async def put_department(
    dept_id: str,
    data: DepartmentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("org:manage")),
):
    """Update a department."""
    dept = await update_department(db, dept_id, data)
    await db.commit()
    await db.refresh(dept)
    await record_audit_log(
        db, user=current_user, action="department.update",
        resource_type="department", resource_id=dept.id,
        details={k: v for k, v in data.model_dump(exclude_unset=True).items()}, request=request,
    )
    return DepartmentNode(
        id=dept.id, tenant_id=dept.tenant_id, parent_id=dept.parent_id,
        name=dept.name, sort_order=dept.sort_order, description=dept.description,
        is_active=dept.is_active,
    )


@router.delete("/departments/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_department(
    dept_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("org:manage")),
):
    """Soft-delete a department (sets is_active=False)."""
    await delete_department(db, dept_id)
    await db.commit()
    await record_audit_log(
        db, user=current_user, action="department.delete",
        resource_type="department", resource_id=dept_id,
        details={}, request=request,
    )