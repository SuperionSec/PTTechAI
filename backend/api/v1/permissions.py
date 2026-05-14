"""
Permission Management API Endpoints
PTTechAI v0.1.0 - RBAC Permission System
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.db.database import get_db
from backend.models.permission import Permission, RolePermission, PermissionScope, PermissionAction
from backend.models.user import User, Role
from backend.core.auth import get_current_user, require_role

router = APIRouter()


class PermissionResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    scope: str
    action: str
    is_active: bool


class RolePermissionResponse(BaseModel):
    id: str
    role: str
    permission_id: str
    permission: Optional[PermissionResponse]


class RolePermissionsSummary(BaseModel):
    role: str
    permissions: List[PermissionResponse]
    total: int


class RoleAccessSummary(BaseModel):
    role: str
    frontend_pages: List[str]
    backend_apis: List[str]


@router.get("", response_model=List[PermissionResponse])
async def list_permissions(
    scope: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """List all permissions (admin only)"""
    query = select(Permission).where(Permission.is_active == True)
    if scope:
        query = query.where(Permission.scope == scope)
    result = await db.execute(query)
    permissions = result.scalars().all()
    return [PermissionResponse(**p.to_dict()) for p in permissions]


@router.get("/roles/access", response_model=List[RoleAccessSummary])
async def get_roles_access_summary(
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Get frontend pages and backend APIs access for all roles (admin only)"""
    return [
        RoleAccessSummary(
            role=role,
            frontend_pages=pages,
            backend_apis=ROLE_BACKEND_APIS.get(role, [])
        )
        for role, pages in ROLE_FRONTEND_PAGES.items()
    ]


@router.get("/roles/access/{role}", response_model=RoleAccessSummary)
async def get_role_access_detail(
    role: str,
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Get frontend pages and backend APIs access for a specific role (admin only)"""
    if role not in ROLE_FRONTEND_PAGES:
        raise HTTPException(status_code=404, detail="Role not found")
    return RoleAccessSummary(
        role=role,
        frontend_pages=ROLE_FRONTEND_PAGES[role],
        backend_apis=ROLE_BACKEND_APIS.get(role, [])
    )


@router.get("/roles/{role}", response_model=RolePermissionsSummary)
async def get_role_permissions(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Get permissions for a specific role (admin only)"""
    result = await db.execute(
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role == role)
        .where(Permission.is_active == True)
    )
    permissions = result.scalars().all()
    return RolePermissionsSummary(
        role=role,
        permissions=[PermissionResponse(**p.to_dict()) for p in permissions],
        total=len(permissions)
    )


@router.get("/my-permissions", response_model=List[PermissionResponse])
async def get_my_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's permissions"""
    role_value = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
    result = await db.execute(
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role == role_value)
        .where(Permission.is_active == True)
    )
    permissions = result.scalars().all()
    return [PermissionResponse(**p.to_dict()) for p in permissions]


@router.post("/roles/{role}/assign/{permission_id}")
async def assign_permission_to_role(
    role: str,
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Assign a permission to a role (admin only)"""
    import uuid

    # Check if permission exists
    perm_result = await db.execute(select(Permission).where(Permission.id == permission_id))
    permission = perm_result.scalar_one_or_none()
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    # Check if already assigned
    existing = await db.execute(
        select(RolePermission).where(
            RolePermission.role == role,
            RolePermission.permission_id == permission_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Permission already assigned to role")

    rp = RolePermission(
        id=str(uuid.uuid4()),
        role=role,
        permission_id=permission_id,
    )
    db.add(rp)
    await db.commit()

    return {"message": f"Permission assigned to {role}"}


@router.delete("/roles/{role}/revoke/{permission_id}")
async def revoke_permission_from_role(
    role: str,
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Revoke a permission from a role (admin only)"""
    result = await db.execute(
        select(RolePermission).where(
            RolePermission.role == role,
            RolePermission.permission_id == permission_id
        )
    )
    rp = result.scalar_one_or_none()
    if not rp:
        raise HTTPException(status_code=404, detail="Role permission mapping not found")

    await db.delete(rp)
    await db.commit()

    return {"message": f"Permission revoked from {role}"}


# Role-Frontend Pages Mapping
ROLE_FRONTEND_PAGES = {
    "admin": ["/", "/scan/new", "/scan/:scanId", "/agent/:agentId", "/tasks", "/realtime",
              "/reports", "/reports/:reportId", "/settings", "/scheduler", "/sandboxes",
              "/knowledge", "/mcp", "/providers", "/full-ia", "/vuln-lab", "/terminal",
              "/auto", "/users", "/profile", "/languages", "/roles"],
    "user": ["/", "/scan/new", "/scan/:scanId", "/agent/:agentId", "/tasks", "/realtime",
             "/reports", "/reports/:reportId", "/settings", "/scheduler", "/sandboxes",
             "/knowledge", "/mcp", "/providers", "/full-ia", "/vuln-lab", "/terminal",
             "/auto", "/profile", "/languages"],
    "viewer": ["/", "/scan/:scanId", "/reports", "/reports/:reportId", "/knowledge",
               "/profile", "/languages"],
    "service": []  # No frontend access
}

# Role-Backend APIs Mapping (simplified)
ROLE_BACKEND_APIS = {
    "admin": [
        "GET/POST/PUT/DELETE /api/v1/scans",
        "GET/POST /api/v1/reports",
        "GET/POST/PUT/DELETE /api/v1/users",
        "GET/PUT /api/v1/settings",
        "GET /api/v1/dashboard/stats",
        "GET/POST /api/v1/agent-tasks",
        "GET/POST /api/v1/permissions",
        "GET/POST /api/v1/knowledge",
        "GET/POST /api/v1/scheduler",
        "GET /api/v1/providers",
    ],
    "user": [
        "GET/POST /api/v1/scans",
        "GET/POST /api/v1/reports",
        "GET /api/v1/settings",
        "GET /api/v1/dashboard/stats",
        "GET/POST /api/v1/agent-tasks",
        "GET/POST /api/v1/knowledge",
        "GET /api/v1/scheduler",
        "GET /api/v1/providers",
    ],
    "viewer": [
        "GET /api/v1/scans",
        "GET /api/v1/reports",
        "GET /api/v1/settings",
        "GET /api/v1/dashboard/stats",
        "GET /api/v1/knowledge",
        "GET /api/v1/providers",
    ],
    "service": [
        "POST /api/v1/agent/run",
        "GET /api/v1/agent/status/{agent_id}",
        "GET /api/v1/agent/findings/{agent_id}",
    ]
}



