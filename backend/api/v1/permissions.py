"""
Permission Management API Endpoints
PTTechAI v0.1.0 - RBAC Permission System
"""
import uuid
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete

from backend.db.database import get_db
from backend.models.permission import Permission, RolePermission, ResourceMapping, PermissionScope, PermissionAction
from backend.models.user import User, Role
from backend.core.auth import get_current_user, require_role
from backend.core.resource_guard import resource_guard

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


# System roles that cannot be modified/deleted
SYSTEM_ROLES = {"admin", "user", "viewer", "service"}


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
    # Query all distinct roles from RolePermission
    role_result = await db.execute(select(RolePermission.role).distinct())
    db_roles = set(role_result.scalars().all())

    # Also include system roles that may have no permissions yet
    all_roles = db_roles | SYSTEM_ROLES

    # Count users per role
    user_counts = {}
    for role in all_roles:
        count_result = await db.execute(
            select(func.count(User.id)).where(User.role == role)
        )
        user_counts[role] = count_result.scalar() or 0

    # Count permissions per role
    perm_counts = {}
    for role in all_roles:
        count_result = await db.execute(
            select(func.count(RolePermission.id)).where(RolePermission.role == role)
        )
        perm_counts[role] = count_result.scalar() or 0

    return [
        RoleSummary(
            role=role,
            user_count=user_counts.get(role, 0),
            permission_count=perm_counts.get(role, 0)
        )
        for role in sorted(all_roles)
    ]


@router.post("/roles", response_model=RoleDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: CreateRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Create a new role with permissions (admin only)"""
    role_name = request.role.strip()

    # Check role doesn't already exist in RolePermission
    existing = await db.execute(
        select(RolePermission).where(RolePermission.role == role_name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role already exists")

    # Also check if it's a known system role
    if role_name in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot create system role")

    # Check all permission_ids exist in Permission table
    if request.permission_ids:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(request.permission_ids))
        )
        found_perms = {p.id for p in perm_result.scalars().all()}
        missing = set(request.permission_ids) - found_perms
        if missing:
            raise HTTPException(status_code=400, detail=f"Permission IDs not found: {missing}")

    # Create RolePermission entries for each permission
    created_permissions = []
    for perm_id in request.permission_ids:
        rp = RolePermission(
            id=str(uuid.uuid4()),
            role=role_name,
            permission_id=perm_id,
        )
        db.add(rp)

    await db.commit()

    # Fetch created permissions for response
    if request.permission_ids:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(request.permission_ids))
        )
        created_permissions = perm_result.scalars().all()

    return RoleDetailResponse(
        role=role_name,
        permissions=[PermissionResponse(**p.to_dict()) for p in created_permissions],
        total=len(created_permissions)
    )


@router.put("/roles/{role}", response_model=RoleDetailResponse)
async def update_role_permissions(
    role: str,
    request: UpdateRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Update role permissions (admin only)"""
    # Protect system roles
    if role in SYSTEM_ROLES:
        raise HTTPException(status_code=403, detail="Cannot modify system role")

    # Check all permission_ids exist in Permission table
    if request.permission_ids:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(request.permission_ids))
        )
        found_perms = {p.id for p in perm_result.scalars().all()}
        missing = set(request.permission_ids) - found_perms
        if missing:
            raise HTTPException(status_code=400, detail=f"Permission IDs not found: {missing}")

    # Delete all existing RolePermission for this role
    await db.execute(
        delete(RolePermission).where(RolePermission.role == role)
    )

    # Create new RolePermission entries
    created_permissions = []
    for perm_id in request.permission_ids:
        rp = RolePermission(
            id=str(uuid.uuid4()),
            role=role,
            permission_id=perm_id,
        )
        db.add(rp)

    await db.commit()

    # Fetch updated permissions for response
    if request.permission_ids:
        perm_result = await db.execute(
            select(Permission).where(Permission.id.in_(request.permission_ids))
        )
        created_permissions = perm_result.scalars().all()

    return RoleDetailResponse(
        role=role,
        permissions=[PermissionResponse(**p.to_dict()) for p in created_permissions],
        total=len(created_permissions)
    )


@router.delete("/roles/{role}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Delete a custom role (admin only)"""
    # Protect system roles
    if role in SYSTEM_ROLES:
        raise HTTPException(status_code=403, detail="Cannot delete system role")

    # Check if any User has this role
    user_result = await db.execute(
        select(func.count(User.id)).where(User.role == role)
    )
    user_count = user_result.scalar() or 0
    if user_count > 0:
        raise HTTPException(status_code=400, detail="Role is assigned to users")

    # Delete all RolePermission entries for this role
    await db.execute(
        delete(RolePermission).where(RolePermission.role == role)
    )

    await db.commit()

    return None


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
    # Check if permission exists
    perm_result = await db.execute(select(Permission).where(Permission.id == request.permission_id))
    if not perm_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Permission not found")

    # Check if mapping already exists
    existing = await db.execute(
        select(ResourceMapping).where(
            ResourceMapping.permission_id == request.permission_id,
            ResourceMapping.resource_type == request.resource_type,
            ResourceMapping.resource_path == request.resource_path
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Resource mapping already exists")

    rm = ResourceMapping(
        id=str(uuid.uuid4()),
        permission_id=request.permission_id,
        resource_type=request.resource_type,
        resource_path=request.resource_path,
    )
    db.add(rm)
    await db.commit()
    await db.refresh(rm)

    return ResourceMappingResponse(**rm.to_dict())


@router.delete("/resource-mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource_mapping(
    mapping_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_role(Role.ADMIN))
):
    """Delete a resource mapping (admin only)"""
    result = await db.execute(select(ResourceMapping).where(ResourceMapping.id == mapping_id))
    rm = result.scalar_one_or_none()
    if not rm:
        raise HTTPException(status_code=404, detail="Resource mapping not found")

    await db.delete(rm)
    await db.commit()

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
        "frontend_pages": [],
        "backend_apis": []
    }

    # Recommend frontend pages based on scope
    scope_page_map = {
        "scan": ["/scan/new", "/scan/:scanId"],
        "target": ["/scan/new", "/scan/:scanId"],
        "report": ["/reports", "/reports/:reportId"],
        "vulnerability": ["/vuln-lab"],
        "dashboard": ["/"],
        "settings": ["/settings", "/languages"],
        "user": ["/users", "/profile", "/roles"],
        "api_key": ["/settings"],
        "provider": ["/providers"],
        "agent": ["/agent/:agentId", "/tasks", "/realtime", "/auto"],
        "scheduler": ["/scheduler"],
        "knowledge": ["/knowledge"],
    }

    if scope in scope_page_map:
        recommendations["frontend_pages"] = scope_page_map[scope]

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
    
    apis = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            # Skip HEAD methods
            methods = list(route.methods - {'HEAD'})
            if not methods:
                continue
            
            # Extract permission requirement from dependencies if available
            permission_required = None
            if hasattr(route, 'dependencies'):
                for dep in route.dependencies:
                    if hasattr(dep, 'dependency') and hasattr(dep.dependency, '_permission_required'):
                        permission_required = dep.dependency._permission_required
            
            apis.append(APIEndpointInfo(
                methods=methods,
                path=route.path,
                summary=getattr(route, 'summary', None),
                tags=route.tags if hasattr(route, 'tags') else []
            ))
    
    # Sort by path for consistent output
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
    
    unmapped = []
    
    # Get all registered API routes
    registered_apis = set()
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            methods = list(route.methods - {'HEAD'})
            for method in methods:
                registered_apis.add(f"{method} {route.path}")
    
    # Get all mapped APIs from database
    result = await db.execute(
        select(ResourceMapping).where(ResourceMapping.resource_type == "backend_api")
    )
    mapped_apis = {m.resource_path for m in result.scalars().all()}
    
    # Find unmapped APIs
    for api_path in registered_apis:
        if api_path not in mapped_apis:
            unmapped.append(UnmappedResourceResponse(
                resource_type="backend_api",
                resource_path=api_path,
                reason="No permission mapping found"
            ))
    
    # Get all frontend pages from resource mappings
    result = await db.execute(
        select(ResourceMapping).where(ResourceMapping.resource_type == "frontend_page")
    )
    mapped_pages = {m.resource_path for m in result.scalars().all()}
    
    # Known frontend routes that should have mappings
    known_pages = [
        "/", "/scan/new", "/scan/:scanId",
        "/reports", "/reports/:reportId",
        "/vuln-lab",
        "/settings", "/languages",
        "/users", "/profile", "/roles",
        "/providers",
        "/agent/:agentId", "/tasks", "/realtime", "/auto",
        "/scheduler",
        "/knowledge",
    ]
    
    for page in known_pages:
        if page not in mapped_pages:
            unmapped.append(UnmappedResourceResponse(
                resource_type="frontend_page",
                resource_path=page,
                reason="No permission mapping found"
            ))
    
    return unmapped
