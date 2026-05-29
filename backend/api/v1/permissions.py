"""
Permission Management API Endpoints
PTTechAI v0.1.0 - RBAC Permission System
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.common.db.database import get_db
from backend.common.models.permission import Permission, RolePermission, ResourceMapping, PermissionScope, PermissionAction
from backend.common.models.user import User, Role
from backend.common.infra.auth import get_current_user, require_role
from backend.common.infra.resource_guard import resource_guard
from backend.common.schemas.rbac import RoleCreate as RbacRoleCreate
from backend.services import rbac_service

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


class RoleSummary(BaseModel):
    role: str
    user_count: int
    permission_count: int


class CreateRoleRequest(BaseModel):
    role: str
    permission_ids: List[str]

    @field_validator("role")
    @classmethod
    def validate_role_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Role name cannot be empty")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Role name must be alphanumeric or underscore")
        return v


class UpdateRoleRequest(BaseModel):
    permission_ids: List[str]


class RoleDetailResponse(BaseModel):
    role: str
    permissions: List[PermissionResponse]
    total: int


class ResourceMappingResponse(BaseModel):
    id: str
    permission_id: str
    resource_type: str
    resource_path: str
    version: int
    updated_at: Optional[str]


class CreateResourceMappingRequest(BaseModel):
    permission_id: str
    resource_type: str
    resource_path: str


class UserPermissionsResponse(BaseModel):
    role: str
    permissions: List[str]
    frontend_pages: List[str]
    backend_apis: List[str]


class APIEndpointInfo(BaseModel):
    methods: List[str]
    path: str
    summary: Optional[str]
    tags: List[str]


class UnmappedResourceResponse(BaseModel):
    resource_type: str
    resource_path: str
    reason: str


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


@router.get("/roles", response_model=List[RoleSummary])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """List all roles with user count and permission count (admin only)"""
    roles = await rbac_service.list_roles(db)
    return [
        RoleSummary(
            role=role.role,
            user_count=role.user_count,
            permission_count=role.permission_count,
        )
        for role in roles
    ]


@router.post("/roles", response_model=RoleDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: CreateRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Create a new role with permissions (admin only)"""
    detail = await rbac_service.create_role(
        db,
        RbacRoleCreate(
            name=request.role,
            display_name=request.role.strip().title(),
            permission_ids=request.permission_ids,
        ),
    )
    return RoleDetailResponse(
        role=detail.role,
        permissions=[PermissionResponse(**permission.model_dump()) for permission in detail.permissions],
        total=detail.total,
    )


@router.put("/roles/{role}", response_model=RoleDetailResponse)
async def update_role_permissions(
    role: str,
    request: UpdateRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Update role permissions (admin only)"""
    detail = await rbac_service.update_role_permissions(db, role, request.permission_ids)
    return RoleDetailResponse(
        role=detail.role,
        permissions=[PermissionResponse(**permission.model_dump()) for permission in detail.permissions],
        total=detail.total,
    )


@router.delete("/roles/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Delete a custom role (admin only)"""
    await rbac_service.delete_role(db, role)
    return None


@router.get("/roles/{role}", response_model=RolePermissionsSummary)
async def get_role_permissions(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Get permissions for a specific role (admin only)"""
    detail = await rbac_service.get_role_detail(db, role)
    return RolePermissionsSummary(
        role=detail.role,
        permissions=[PermissionResponse(**permission.model_dump()) for permission in detail.permissions],
        total=detail.total,
    )


@router.get("/my-permissions", response_model=List[PermissionResponse])
async def get_my_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's permissions"""
    permissions = await resource_guard.get_user_permissions(current_user, db)
    return [PermissionResponse(**permission.to_dict()) for permission in permissions]


@router.post("/roles/{role}/assign/{permission_id}")
async def assign_permission_to_role(
    role: str,
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Assign a permission to a role (admin only)"""
    detail = await rbac_service.get_role_detail(db, role)
    permission_ids = [permission.id for permission in detail.permissions]
    if permission_id in permission_ids:
        raise HTTPException(status_code=400, detail="Permission already assigned to role")
    await rbac_service.update_role_permissions(db, role, [*permission_ids, permission_id])

    return {"message": f"Permission assigned to {role}"}


@router.delete("/roles/{role}/revoke/{permission_id}")
async def revoke_permission_from_role(
    role: str,
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Revoke a permission from a role (admin only)"""
    detail = await rbac_service.get_role_detail(db, role)
    permission_ids = [permission.id for permission in detail.permissions]
    if permission_id not in permission_ids:
        raise HTTPException(status_code=404, detail="Role permission mapping not found")
    await rbac_service.update_role_permissions(db, role, [existing_permission_id for existing_permission_id in permission_ids if existing_permission_id != permission_id])

    return {"message": f"Permission revoked from {role}"}


# ============================================================================
# Resource Mapping APIs
# ============================================================================

@router.get("/resource-mappings", response_model=List[ResourceMappingResponse])
async def list_resource_mappings(
    permission_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """List all resource mappings (admin only)"""
    query = select(ResourceMapping)
    if permission_id:
        query = query.where(ResourceMapping.permission_id == permission_id)
    if resource_type:
        query = query.where(ResourceMapping.resource_type == resource_type)
    result = await db.execute(query)
    mappings = result.scalars().all()
    return [ResourceMappingResponse(**m.to_dict()) for m in mappings]


@router.post("/resource-mappings", response_model=ResourceMappingResponse, status_code=status.HTTP_201_CREATED)
async def create_resource_mapping(
    request: CreateResourceMappingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Create a new resource mapping (admin only)"""
    mapping = await rbac_service.create_resource_mapping(
        db,
        request.permission_id,
        request.resource_type,
        request.resource_path,
    )
    return ResourceMappingResponse(**mapping.model_dump())


@router.delete("/resource-mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_mapping(
    mapping_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Delete a resource mapping (admin only)"""
    await rbac_service.delete_resource_mapping(db, mapping_id)
    return None


@router.get("/resource-mappings/recommend")
async def get_recommended_mappings(
    permission_name: str,
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Get recommended resource mappings for a permission (admin only)"""
    # Simple recommendation based on permission name
    parts = permission_name.split(":")
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Invalid permission name format")

    scope, action = parts

    recommendations = {
        "frontend_pages": [path for path, _name, permission, _icon, _group in rbac_service.FRONTEND_ROUTES if permission == permission_name],
        "backend_apis": []
    }

    # Recommend backend APIs based on scope and action
    action_method_map = {
        "create": "POST",
        "read": "GET",
        "update": "PUT",
        "delete": "DELETE",
        "execute": "POST",
        "manage": "GET/POST/PUT/DELETE"
    }

    method = action_method_map.get(action, "GET")
    recommendations["backend_apis"] = [f"{method} /api/v1/{scope}s"]

    return recommendations


# ============================================================================
# System APIs Discovery
# ============================================================================

@router.get("/system/apis", response_model=List[APIEndpointInfo])
async def list_system_apis(
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """List all registered API endpoints in the system (admin only).
    
    This endpoint returns all API routes registered in the FastAPI application,
    useful for permission mapping management.
    """
    from backend.main import app
    
    apis_by_path = {}
    for resource in rbac_service.discover_api_routes(app):
        method, path = resource.split(" ", 1)
        apis_by_path.setdefault(path, []).append(method)

    apis = [
        APIEndpointInfo(
            methods=sorted(methods),
            path=path,
            summary=None,
            tags=[],
        )
        for path, methods in apis_by_path.items()
    ]

    apis.sort(key=lambda x: x.path)
    return apis


# ============================================================================
# User Permissions API
# ============================================================================

@router.get("/me/detail", response_model=UserPermissionsResponse)
async def get_my_permissions_detail(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's complete permission details including accessible pages and APIs"""
    role_value = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role

    # Get permissions
    permissions = await resource_guard.get_user_permissions(current_user, db)

    # Get accessible pages
    accessible_pages = await resource_guard.get_accessible_pages(current_user, db)

    # Get accessible APIs
    accessible_apis = await resource_guard.get_accessible_apis(current_user, db)

    return UserPermissionsResponse(
        role=role_value,
        permissions=[p.name for p in permissions],
        frontend_pages=accessible_pages,
        backend_apis=accessible_apis
    )


@router.get("/unmapped-resources", response_model=List[UnmappedResourceResponse])
async def list_unmapped_resources(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """List all resources (frontend pages and backend APIs) that are not mapped to any permission.

    This helps identify new pages/APIs that need permission binding.
    """
    from backend.main import app

    unmapped = await rbac_service.list_unmapped_resources(db, app)
    return [UnmappedResourceResponse(**resource.model_dump()) for resource in unmapped]
