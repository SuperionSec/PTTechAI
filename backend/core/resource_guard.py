"""
Resource Guard - Unified permission-based access control
PTTechAI v0.1.0 - RBAC with Resource Mapping
"""
from typing import List, Optional
from fastapi import HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.permission import Permission, RolePermission, ResourceMapping
from backend.models.user import User, Role
from backend.core.auth import get_current_user
from backend.core.rbac.matcher import find_best_api_matches
from backend.core.rbac.policies import UnmappedApiPolicy, get_unmapped_api_policy
from backend.db.database import get_db


class PermissionDenied(HTTPException):
    """Custom permission denied exception"""
    def __init__(self, detail: str = "Permission denied"):
        super().__init__(status_code=403, detail=detail)


async def require_api_permission(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Check if user has permission to access API endpoints."""
    return await check_api_permission(request, current_user, db)


async def user_has_permission_name(db: AsyncSession, role: str, permission_name: str) -> bool:
    result = await db.execute(
        select(RolePermission)
        .join(Permission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role == role)
        .where(Permission.name == permission_name)
        .where(Permission.is_active == True)
    )
    return result.scalar_one_or_none() is not None


async def check_api_permission(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dynamic API permission check based on request method and path.

    This function checks if the current user has permission to access the requested API endpoint
    by looking up the ResourceMapping table.
    """
    user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role

    # Admin always has access
    if current_user.role == Role.ADMIN:
        return current_user

    # Build API pattern from request
    method = request.method
    path = request.url.path

    if path.startswith(("/api/v1/full-ia", "/api/v1/terminal", "/api/v1/sandbox")):
        if await user_has_permission_name(db, user_role, "agent:execute"):
            return current_user
        raise PermissionDenied(detail=f"Permission denied for {method} {path}")

    if path.startswith("/api/v1/mcp"):
        if await user_has_permission_name(db, user_role, "settings:manage"):
            return current_user
        raise PermissionDenied(detail=f"Permission denied for {method} {path}")

    if path.startswith("/api/v1/prompts"):
        if await user_has_permission_name(db, user_role, "settings:manage"):
            return current_user
        raise PermissionDenied(detail=f"Permission denied for {method} {path}")

    # Check if there's a permission mapping for this API
    result = await db.execute(
        select(ResourceMapping.resource_path, ResourceMapping.permission_id)
        .where(ResourceMapping.resource_type == "backend_api")
    )
    mapping_rows = result.all()
    matched_patterns = find_best_api_matches([row[0] for row in mapping_rows], method, path)
    matched_patterns = matched_patterns[:1]
    required_perm_ids = [row[1] for row in mapping_rows if row[0] in matched_patterns]

    if not required_perm_ids:
        policy = get_unmapped_api_policy()
        if policy == UnmappedApiPolicy.DENY:
            raise PermissionDenied(detail=f"No permission mapping found for {method} {path}")
        if policy == UnmappedApiPolicy.WARN:
            print(f"[RBAC] Unmapped API allowed: {method} {path}")
        return current_user
    
    # Check if user's role has any of the required permissions
    result = await db.execute(
        select(RolePermission)
        .where(RolePermission.role == user_role)
        .where(RolePermission.permission_id.in_(required_perm_ids))
    )
    
    if result.scalar_one_or_none() is None:
        raise PermissionDenied(
            detail=f"Permission denied for {method} {path}"
        )
    
    return current_user


class ResourceGuard:
    """Unified resource guard: controls frontend pages and backend API access based on Permissions"""

    async def check_api_access(
        self,
        user: User,
        method: str,
        path: str,
        db: AsyncSession
    ) -> bool:
        """Check if user has permission to access a specific API endpoint"""
        # Admin always has access
        if user.role == Role.ADMIN:
            return True

        # Find permissions required for this API
        result = await db.execute(
            select(ResourceMapping.resource_path, ResourceMapping.permission_id)
            .where(ResourceMapping.resource_type == "backend_api")
        )
        mapping_rows = result.all()
        matched_patterns = find_best_api_matches([row[0] for row in mapping_rows], method, path)
        matched_patterns = matched_patterns[:1]
        required_perm_ids = [row[1] for row in mapping_rows if row[0] in matched_patterns]

        if not required_perm_ids:
            policy = get_unmapped_api_policy()
            if policy == UnmappedApiPolicy.DENY:
                return False
            if policy == UnmappedApiPolicy.WARN:
                print(f"[RBAC] Unmapped API allowed: {method} {path}")
            return True

        # Check if user's role has any of the required permissions
        user_role = user.role.value if hasattr(user.role, 'value') else user.role
        result = await db.execute(
            select(RolePermission)
            .where(RolePermission.role == user_role)
            .where(RolePermission.permission_id.in_(required_perm_ids))
        )
        return result.scalar_one_or_none() is not None

    async def get_accessible_pages(self, user: User, db: AsyncSession) -> List[str]:
        """Get all frontend pages accessible by the user"""
        if user.role == Role.ADMIN:
            # Admin can access all pages
            result = await db.execute(
                select(ResourceMapping.resource_path)
                .where(ResourceMapping.resource_type == "frontend_page")
                .distinct()
            )
            return result.scalars().all()

        user_role = user.role.value if hasattr(user.role, 'value') else user.role
        result = await db.execute(
            select(ResourceMapping.resource_path)
            .join(RolePermission, ResourceMapping.permission_id == RolePermission.permission_id)
            .where(RolePermission.role == user_role)
            .where(ResourceMapping.resource_type == "frontend_page")
            .distinct()
        )
        return result.scalars().all()

    async def get_accessible_apis(self, user: User, db: AsyncSession) -> List[str]:
        """Get all backend APIs accessible by the user"""
        if user.role == Role.ADMIN:
            # Admin can access all APIs
            result = await db.execute(
                select(ResourceMapping.resource_path)
                .where(ResourceMapping.resource_type == "backend_api")
                .distinct()
            )
            return result.scalars().all()

        user_role = user.role.value if hasattr(user.role, 'value') else user.role
        result = await db.execute(
            select(ResourceMapping.resource_path)
            .join(RolePermission, ResourceMapping.permission_id == RolePermission.permission_id)
            .where(RolePermission.role == user_role)
            .where(ResourceMapping.resource_type == "backend_api")
            .distinct()
        )
        return result.scalars().all()

    async def get_user_permissions(self, user: User, db: AsyncSession) -> List[Permission]:
        """Get all permissions for a user"""
        user_role = user.role.value if hasattr(user.role, 'value') else user.role
        result = await db.execute(
            select(Permission)
            .join(RolePermission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role == user_role)
            .where(Permission.is_active == True)
        )
        return result.scalars().all()


# Singleton instance
resource_guard = ResourceGuard()
