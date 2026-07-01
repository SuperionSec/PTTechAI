"""Business logic for organization management (Tenant + Department)."""
from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.models.user import RoleModel, User
from backend.common.infra.tenant_context import TenantContextData
from backend.system.organization.models import Department, Tenant, TenantStatus
from backend.system.organization.schemas import (
    DepartmentCreate,
    DepartmentNode,
    DepartmentUpdate,
    DepartmentTreeResponse,
    TenantCreate,
    TenantListResponse,
    TenantResponse,
    TenantUpdate,
)

DEFAULT_TENANT_CODE = "default"


# ── Tenant service ──


async def list_tenants(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
) -> TenantListResponse:
    query = select(Tenant).order_by(Tenant.created_at.desc())
    if search:
        query = query.where(
            Tenant.name.ilike(f"%{search}%") | Tenant.code.ilike(f"%{search}%")
        )
    total = await db.scalar(select(func.count()).select_from(Tenant)) or 0
    result = await db.execute(query.offset(skip).limit(limit))
    tenants = result.scalars().all()

    tenant_ids = [t.id for t in tenants]
    # Aggregate user/department counts in two grouped queries (avoids N+1).
    user_counts: dict[str, int] = {}
    dept_counts: dict[str, int] = {}
    if tenant_ids:
        user_rows = await db.execute(
            select(User.tenant_id, func.count(User.id))
            .where(User.tenant_id.in_(tenant_ids))
            .group_by(User.tenant_id)
        )
        user_counts = {tid: cnt for tid, cnt in user_rows.all() if tid}
        dept_rows = await db.execute(
            select(Department.tenant_id, func.count(Department.id))
            .where(Department.tenant_id.in_(tenant_ids))
            .group_by(Department.tenant_id)
        )
        dept_counts = {tid: cnt for tid, cnt in dept_rows.all() if tid}

    items = [
        TenantResponse(
            **t.to_dict(),
            user_count=user_counts.get(t.id, 0),
            department_count=dept_counts.get(t.id, 0),
        )
        for t in tenants
    ]
    return TenantListResponse(tenants=items, total=total or 0)


async def get_tenant(db: AsyncSession, tenant_id: str) -> Tenant | None:
    return await db.get(Tenant, tenant_id)


async def get_tenant_by_code(db: AsyncSession, code: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.code == code))
    return result.scalar_one_or_none()


async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
    # Normalize code so "Acme", " acme " and "acme" are treated as the same tenant.
    code = (data.code or "").strip().lower()
    if not code:
        raise HTTPException(status_code=400, detail="Tenant code is required")
    existing = await get_tenant_by_code(db, code)
    if existing:
        raise HTTPException(status_code=400, detail=f"Tenant code '{code}' already exists")

    tenant = Tenant(
        code=code,
        name=data.name,
        status=data.status or "active",
        logo_url=data.logo_url,
        contact_email=data.contact_email,
        contact_phone=data.contact_phone,
        max_users=data.max_users,
        max_storage_gb=data.max_storage_gb,
        is_active=True,
    )
    db.add(tenant)
    await db.flush()

    # Create a default "root" department for every new tenant
    dept = Department(
        tenant_id=tenant.id,
        name=data.name,  # same as company name
        sort_order=0,
        description=f"Root department for {data.name}",
    )
    db.add(dept)
    await db.flush()
    return tenant


async def update_tenant(db: AsyncSession, tenant_id: str, data: TenantUpdate) -> Tenant:
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(tenant, field, value)
    await db.flush()
    return tenant


async def delete_tenant(db: AsyncSession, tenant_id: str) -> None:
    """Soft-suspend a tenant. Prevents new data but preserves for audit."""
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    tenant.status = TenantStatus.SUSPENDED.value
    tenant.is_active = False
    await db.flush()


async def set_tenant_admin(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    is_tenant_admin: bool = True,
) -> User:
    """Promote or demote a tenant user as tenant admin."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="User does not belong to this tenant")

    tenant_admin_role = await db.scalar(
        select(RoleModel).where(RoleModel.name == "tenant_admin", RoleModel.is_active.is_(True))
    )
    if not tenant_admin_role:
        raise HTTPException(status_code=500, detail="tenant_admin role not found")

    if is_tenant_admin:
        user.role_id = tenant_admin_role.id
    else:
        default_role = await db.scalar(
            select(RoleModel).where(RoleModel.name == "user", RoleModel.is_active.is_(True))
        )
        if not default_role:
            raise HTTPException(status_code=500, detail="Default user role not found")
        user.role_id = default_role.id

    await db.flush()
    return user


# ── Department service ──


def _build_tree(
    all_depts: List[Department],
    tenant_id: Optional[str] = None,
    user_counts: Optional[dict] = None,
) -> List[DepartmentNode]:
    """Convert flat department list to nested tree, optionally filtered by tenant.

    ``user_counts`` maps department_id -> direct member count. Each node's
    ``user_count`` is the sum of its own direct members plus all descendants,
    so a parent department shows the total headcount beneath it.
    """
    if tenant_id:
        all_depts = [d for d in all_depts if d.tenant_id == tenant_id]
    counts = user_counts or {}

    # Build node lookup (direct counts first).
    node_map: dict[str, DepartmentNode] = {}
    for d in all_depts:
        node_map[d.id] = DepartmentNode(
            id=d.id, tenant_id=d.tenant_id, parent_id=d.parent_id,
            name=d.name, sort_order=d.sort_order, description=d.description,
            is_active=d.is_active, user_count=int(counts.get(d.id, 0)), children=[],
        )

    roots: List[DepartmentNode] = []
    for node in node_map.values():
        if node.parent_id is None:
            roots.append(node)
        elif node.parent_id in node_map:
            node_map[node.parent_id].children.append(node)

    def _sort_and_rollup(n: DepartmentNode) -> int:
        """Sort children and roll descendant member counts up into each node."""
        n.children.sort(key=lambda x: (x.sort_order, x.name))
        total = n.user_count
        for c in n.children:
            total += _sort_and_rollup(c)
        n.user_count = total
        return total

    roots.sort(key=lambda x: (x.sort_order, x.name))
    for r in roots:
        _sort_and_rollup(r)
    return roots


async def _department_user_counts(db: AsyncSession, tenant_id: Optional[str]) -> dict:
    """Return {department_id: direct active-user count} for a tenant (or all).

    Runs on a dedicated short-lived session so the aggregate is isolated from
    any request-scoped transaction/GUC state on the caller's session.
    """
    from sqlalchemy import text as _text
    from backend.common.db.database import async_session_maker

    sql = (
        "SELECT department_id, COUNT(id) AS cnt FROM users "
        "WHERE department_id IS NOT NULL AND is_active = true "
        + ("AND tenant_id = :tid " if tenant_id else "")
        + "GROUP BY department_id"
    )
    params = {"tid": tenant_id} if tenant_id else {}
    async with async_session_maker() as fresh:
        rows = await fresh.execute(_text(sql), params)
        return {row[0]: row[1] for row in rows.all() if row[0]}


async def list_departments_tree(
    db: AsyncSession,
    ctx: TenantContextData,
    tenant_id: Optional[str] = None,
) -> DepartmentTreeResponse:
    """List department tree for the given tenant (or current tenant from context)."""
    target_tenant_id = tenant_id or ctx.tenant_id
    if not target_tenant_id:
        # Platform admin without explicit tenant → show all
        result = await db.execute(select(Department).order_by(Department.sort_order, Department.name))
        depts = result.scalars().all()
    else:
        result = await db.execute(
            select(Department)
            .where(Department.tenant_id == target_tenant_id)
            .order_by(Department.sort_order, Department.name)
        )
        depts = result.scalars().all()

    counts = await _department_user_counts(db, target_tenant_id)
    tree = _build_tree(list(depts), user_counts=counts)
    return DepartmentTreeResponse(departments=tree, total=len(depts))


async def _resolve_parent(db: AsyncSession, tenant_id: str, parent_id: str) -> Department:
    parent = await db.get(Department, parent_id)
    if not parent:
        raise HTTPException(status_code=400, detail="Parent department not found")
    if parent.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Parent department belongs to a different tenant")
    return parent


async def create_department(db: AsyncSession, data: DepartmentCreate, ctx: TenantContextData) -> Department:
    tenant_id = data.tenant_id or ctx.tenant_id
    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")
    if data.parent_id:
        await _resolve_parent(db, tenant_id, data.parent_id)

    dept = Department(
        tenant_id=tenant_id,
        parent_id=data.parent_id,
        name=data.name,
        sort_order=data.sort_order,
        description=data.description,
    )
    db.add(dept)
    await db.flush()
    return dept


async def update_department(db: AsyncSession, dept_id: str, data: DepartmentUpdate) -> Department:
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if data.parent_id is not None and data.parent_id != dept.parent_id:
        if data.parent_id == dept.id:
            raise HTTPException(status_code=400, detail="Department cannot be its own parent")
        await _resolve_parent(db, dept.tenant_id, data.parent_id)
        # Reject cycles: the new parent must not be a descendant of this dept,
        # otherwise the branch detaches from every root and vanishes from the tree.
        descendant_ids = set(await get_sub_department_ids(db, dept.tenant_id, dept.id))
        if data.parent_id in descendant_ids:
            raise HTTPException(status_code=400, detail="Cannot move a department under one of its own descendants")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dept, field, value)
    await db.flush()
    return dept


async def delete_department(db: AsyncSession, dept_id: str) -> None:
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Prevent deleting a department that still has children
    child_ids = await db.execute(
        select(Department.id).where(
            Department.parent_id == dept_id, Department.is_active.is_(True)
        )
    )
    if child_ids.scalars().first():
        raise HTTPException(status_code=400, detail="Cannot delete department with active children")

    # Prevent deleting a department that still has users assigned
    user_count = await db.scalar(
        select(func.count()).select_from(User).where(
            User.department_id == dept_id, User.is_active.is_(True)
        )
    ) or 0
    if user_count > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete department with {user_count} active users")

    dept.is_active = False
    await db.flush()


async def get_sub_department_ids(db: AsyncSession, tenant_id: str, dept_id: str) -> List[str]:
    """Get parent department + all children recursively as flat list."""
    result = await db.execute(
        select(Department).where(Department.tenant_id == tenant_id)
    )
    all_depts = result.scalars().all()

    ids = [dept_id]
    stack = [dept_id]
    while stack:
        current = stack.pop()
        for d in all_depts:
            if d.parent_id == current and d.id not in ids:
                ids.append(d.id)
                stack.append(d.id)
    return ids