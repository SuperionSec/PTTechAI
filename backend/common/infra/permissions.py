"""
Permission Control Middleware and Helpers
PTTechAI v0.1.0 - RBAC with User-Role-Permission three-level association
"""
from typing import Optional, List
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.models.permission import Permission, RolePermission, PermissionScope, PermissionAction
from backend.common.models.user import RoleModel, User
from backend.common.infra.auth import get_current_user
from backend.common.infra.rbac.access_helpers import is_admin_role, role_name_for, role_permission_filter


class PermissionDenied(HTTPException):
    """Custom permission denied exception"""
    def __init__(self, detail: str = "Permission denied"):
        super().__init__(status_code=403, detail=detail)


async def has_permission_name(db: AsyncSession, user: User, permission_name: str) -> bool:
    if is_admin_role(user):
        return True
    result = await db.execute(
        select(Permission.id)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(role_permission_filter(user))
        .where(Permission.name == permission_name)
        .where(Permission.is_active == True)
    )
    return result.scalar_one_or_none() is not None


def require_permission_name(permission_name: str):
    async def _check_permission(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if not await has_permission_name(db, current_user, permission_name):
            raise PermissionDenied(f"Permission required: {permission_name}")
        return current_user
    return _check_permission


async def get_role_permissions(db: AsyncSession, role) -> List[Permission]:
    """Get all permissions for a role"""
    role_value = role_name_for(role) if isinstance(role, User) else (role.value if hasattr(role, "value") else role)
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_value))
    if not role_model:
        return []
    query = (
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role_id == role_model.id)
        .where(Permission.is_active == True)
    )
    result = await db.execute(query)
    return result.scalars().unique().all()


async def get_user_permissions(db: AsyncSession, user: User) -> List[Permission]:
    """Get all permissions for a user"""
    result = await db.execute(
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(role_permission_filter(user))
        .where(Permission.is_active == True)
    )
    return result.scalars().all()


async def has_permission(
    db: AsyncSession,
    user: User,
    scope: PermissionScope,
    action: PermissionAction
) -> bool:
    """Check if user has a specific permission"""
    # Admin always has all permissions
    if is_admin_role(user):
        return True

    # Check role-permission mapping
    result = await db.execute(
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(role_permission_filter(user))
        .where(Permission.scope == scope)
        .where(Permission.action == action)
        .where(Permission.is_active == True)
    )
    return result.scalar_one_or_none() is not None


def require_permission(
    scope: PermissionScope,
    action: PermissionAction
):
    """Dependency factory to require a specific permission.

    Usage:
        @router.get("", dependencies=[Depends(require_permission(PermissionScope.SCAN, PermissionAction.READ))])
    """
    async def _check_permission(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> User:
        if not await has_permission(db, current_user, scope, action):
            raise PermissionDenied(
                f"Permission required: {scope.value}:{action.value}"
            )
        return current_user
    return _check_permission


# Common permission dependencies - direct callables for FastAPI Depends
def require_scan_create():
    return require_permission(PermissionScope.SCAN, PermissionAction.CREATE)

def require_scan_read():
    return require_permission(PermissionScope.SCAN, PermissionAction.READ)

def require_scan_update():
    return require_permission(PermissionScope.SCAN, PermissionAction.UPDATE)

def require_scan_delete():
    return require_permission(PermissionScope.SCAN, PermissionAction.DELETE)

def require_scan_execute():
    return require_permission(PermissionScope.SCAN, PermissionAction.EXECUTE)

def require_report_read():
    return require_permission(PermissionScope.REPORT, PermissionAction.READ)

def require_report_create():
    return require_permission(PermissionScope.REPORT, PermissionAction.CREATE)

def require_report_delete():
    return require_permission(PermissionScope.REPORT, PermissionAction.DELETE)

def require_user_manage():
    return require_permission(PermissionScope.USER, PermissionAction.MANAGE)

def require_user_read():
    return require_permission(PermissionScope.USER, PermissionAction.READ)

def require_user_create():
    return require_permission(PermissionScope.USER, PermissionAction.CREATE)

def require_user_update():
    return require_permission(PermissionScope.USER, PermissionAction.UPDATE)

def require_user_delete():
    return require_permission(PermissionScope.USER, PermissionAction.DELETE)

def require_dashboard_read():
    return require_permission(PermissionScope.DASHBOARD, PermissionAction.READ)

def require_settings_read():
    return require_permission(PermissionScope.SETTINGS, PermissionAction.READ)

def require_settings_update():
    return require_permission(PermissionScope.SETTINGS, PermissionAction.UPDATE)

def require_settings_manage():
    return require_permission(PermissionScope.SETTINGS, PermissionAction.MANAGE)

def require_agent_read():
    return require_permission(PermissionScope.AGENT, PermissionAction.READ)

def require_agent_execute():
    return require_permission(PermissionScope.AGENT, PermissionAction.EXECUTE)

def require_target_read():
    return require_permission(PermissionScope.TARGET, PermissionAction.READ)

def require_target_create():
    return require_permission(PermissionScope.TARGET, PermissionAction.CREATE)

def require_target_delete():
    return require_permission(PermissionScope.TARGET, PermissionAction.DELETE)

def require_vulnerability_read():
    return require_permission(PermissionScope.VULNERABILITY, PermissionAction.READ)

def require_scheduler_read():
    return require_permission(PermissionScope.SCHEDULER, PermissionAction.READ)

def require_scheduler_manage():
    return require_permission(PermissionScope.SCHEDULER, PermissionAction.MANAGE)

def require_knowledge_read():
    return require_permission(PermissionScope.KNOWLEDGE, PermissionAction.READ)

def require_knowledge_manage():
    return require_permission(PermissionScope.KNOWLEDGE, PermissionAction.MANAGE)

def require_provider_read():
    return require_permission(PermissionScope.PROVIDER, PermissionAction.READ)

def require_provider_manage():
    return require_permission(PermissionScope.PROVIDER, PermissionAction.MANAGE)

def require_api_key_read():
    return require_permission(PermissionScope.API_KEY, PermissionAction.READ)

def require_api_key_create():
    return require_permission(PermissionScope.API_KEY, PermissionAction.CREATE)

def require_api_key_delete():
    return require_permission(PermissionScope.API_KEY, PermissionAction.DELETE)


class PermissionChecker:
    """Class-based permission checker for complex scenarios"""

    def __init__(self, user: User):
        self.user = user
        self._permissions: Optional[List[Permission]] = None

    async def load_permissions(self, db: AsyncSession):
        """Load permissions from database"""
        self._permissions = await get_user_permissions(db, self.user)

    def can(self, scope: PermissionScope, action: PermissionAction) -> bool:
        """Check if user can perform an action"""
        if is_admin_role(self.user):
            return True
        if self._permissions is None:
            raise RuntimeError("Permissions not loaded. Call load_permissions() first.")
        return any(
            p.scope == scope and p.action == action
            for p in self._permissions
        )

    def can_any(self, *permissions: tuple) -> bool:
        """Check if user has any of the specified permissions"""
        if is_admin_role(self.user):
            return True
        if self._permissions is None:
            raise RuntimeError("Permissions not loaded. Call load_permissions() first.")
        return any(
            any(p.scope == scope and p.action == action for p in self._permissions)
            for scope, action in permissions
        )

    def can_all(self, *permissions: tuple) -> bool:
        """Check if user has all of the specified permissions"""
        if is_admin_role(self.user):
            return True
        if self._permissions is None:
            raise RuntimeError("Permissions not loaded. Call load_permissions() first.")
        return all(
            any(p.scope == scope and p.action == action for p in self._permissions)
            for scope, action in permissions
        )


async def get_permission_checker(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> PermissionChecker:
    """Dependency to get a permission checker instance"""
    checker = PermissionChecker(current_user)
    await checker.load_permissions(db)
    return checker
