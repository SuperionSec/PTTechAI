import re
import uuid
from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.core.rbac.access_helpers import is_admin_role, role_name_for, role_permission_filter
from backend.core.rbac.matcher import match_api_resource
from backend.models.permission import Permission, ResourceMapping, RolePermission
from backend.models.user import RoleModel, User
from backend.schemas.rbac import MenuItemOut, PermissionOut, ResourceMappingOut, RoleCreate, RoleDetailOut, RoleSummaryOut, RoleUpdate, UnmappedResourceOut

PROTECTED_SYSTEM_ROLES = {"admin"}
DEFAULT_ROLE_NAMES = {"admin", "user", "viewer", "service"}
ROLE_NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,50}$")
RESOURCE_TYPES = {"backend_api", "frontend_page"}
API_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
FRONTEND_ROUTES = [
    ("/", "sidebar.dashboard", "dashboard:read", "DashboardOutlined", "pentest"),
    ("/auto", "sidebar.autoPentest", "agent:execute", "RobotOutlined", "pentest"),
    ("/scan/new", "sidebar.aiAgent", "scan:create", "PlusCircleOutlined", "pentest"),
    ("/realtime", "sidebar.realtimeTask", "agent:execute", "ThunderboltOutlined", "pentest"),
    ("/full-ia", "sidebar.fullIaTesting", "agent:execute", "AimOutlined", "pentest"),
    ("/vuln-lab", "sidebar.vulnLab", "vulnerability:read", "ExperimentOutlined", "pentest"),
    ("/terminal", "sidebar.terminalAgent", "agent:execute", "CodeOutlined", "pentest"),
    ("/sandboxes", "sidebar.sandboxes", "agent:execute", "CloudServerOutlined", "pentest"),
    ("/tasks", "sidebar.taskLibrary", "agent:read", "BookOutlined", "pentest"),
    ("/knowledge", "sidebar.knowledge", "knowledge:read", "DatabaseOutlined", "pentest"),
    ("/mcp", "sidebar.mcpServers", "settings:manage", "ApiOutlined", "pentest"),
    ("/providers", "sidebar.providers", "provider:read", "ApiOutlined", "pentest"),
    ("/scheduler", "sidebar.scheduler", "scheduler:read", "ScheduleOutlined", "pentest"),
    ("/reports", "sidebar.reports", "report:read", "FileTextOutlined", "pentest"),
    ("/users", "usersManagement.title", "user:manage", "TeamOutlined", "system"),
    ("/roles", "roleManagement.title", "user:manage", "SafetyCertificateOutlined", "system"),
    ("/unmapped-resources", "accessCoverage.title", "user:manage", "UserSwitchOutlined", "system"),
    ("/languages", "languageManagement.title", "settings:read", "TranslationOutlined", "system"),
    ("/settings", "sidebar.settings", "settings:read", "SettingOutlined", "pentest"),
    ("/api-keys", "apiKeys.title", "api_key:read", "KeyOutlined", None),
    ("/profile", "profile.title", None, "UserOutlined", None),
]
PUBLIC_API_RESOURCES = {
    "GET /api/health",
    "POST /api/v1/auth/login",
    "POST /api/v1/auth/logout",
    "POST /api/v1/auth/logout-all",
    "POST /api/v1/auth/refresh",
    "POST /api/v1/auth/register",
}


def permission_out(permission: Permission) -> PermissionOut:
    return PermissionOut(**permission.to_dict())


def resource_mapping_out(mapping: ResourceMapping) -> ResourceMappingOut:
    data = mapping.to_dict()
    return ResourceMappingOut(
        **data,
        permission_name=mapping.permission.name if mapping.permission else None,
    )


async def list_permissions(db: AsyncSession, scope: str | None = None) -> list[PermissionOut]:
    query = select(Permission).where(Permission.is_active == True)
    if scope:
        query = query.where(Permission.scope == scope)
    result = await db.execute(query.order_by(Permission.scope, Permission.action, Permission.name))
    return [permission_out(permission) for permission in result.scalars().all()]


async def list_roles(db: AsyncSession) -> list[RoleSummaryOut]:
    role_rows = await db.execute(select(RoleModel).order_by(RoleModel.is_system.desc(), RoleModel.name))
    role_models = list(role_rows.scalars().all())

    existing_names = {role.name for role in role_models}
    db_roles_result = await db.execute(select(RolePermission.role).distinct())
    user_roles_result = await db.execute(select(User.role).distinct())
    legacy_names = (set(db_roles_result.scalars().all()) | set(user_roles_result.scalars().all()) | DEFAULT_ROLE_NAMES) - existing_names

    summaries = []
    for role in role_models:
        user_count = await db.scalar(select(func.count(User.id)).where((User.role_id == role.id) | (User.role == role.name))) or 0
        permission_count = await db.scalar(select(func.count(RolePermission.id)).where((RolePermission.role_id == role.id) | (RolePermission.role == role.name))) or 0
        summaries.append(
            RoleSummaryOut(
                role=role.name,
                id=role.id,
                display_name=role.display_name,
                description=role.description,
                is_system=role.name in PROTECTED_SYSTEM_ROLES,
                is_active=role.is_active,
                user_count=user_count,
                permission_count=permission_count,
            )
        )

    for role in sorted(legacy_names):
        user_count = await db.scalar(select(func.count(User.id)).where(User.role == role)) or 0
        permission_count = await db.scalar(select(func.count(RolePermission.id)).where(RolePermission.role == role)) or 0
        summaries.append(RoleSummaryOut(role=role, is_system=role in PROTECTED_SYSTEM_ROLES, user_count=user_count, permission_count=permission_count))
    return summaries


async def get_role_detail(db: AsyncSession, role: str) -> RoleDetailOut:
    role_name = _normalize_role_name(role)
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name))
    query = (
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role == role_name)
        .where(Permission.is_active == True)
        .order_by(Permission.scope, Permission.action, Permission.name)
    )
    if role_model:
        query = (
            select(Permission)
            .join(RolePermission, Permission.id == RolePermission.permission_id)
            .where((RolePermission.role_id == role_model.id) | (RolePermission.role == role_name))
            .where(Permission.is_active == True)
            .order_by(Permission.scope, Permission.action, Permission.name)
        )
    result = await db.execute(query)
    permissions = [permission_out(permission) for permission in result.scalars().unique().all()]
    return RoleDetailOut(
        role=role_name,
        id=role_model.id if role_model else None,
        display_name=role_model.display_name if role_model else None,
        description=role_model.description if role_model else None,
        is_system=role_name in PROTECTED_SYSTEM_ROLES,
        is_active=role_model.is_active if role_model else True,
        permissions=permissions,
        total=len(permissions),
    )

def _normalize_role_name(name: str) -> str:
    role_name = name.strip().lower()
    if not role_name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if not ROLE_NAME_PATTERN.fullmatch(role_name):
        raise HTTPException(status_code=400, detail="Role name must contain only lowercase letters, numbers, and underscores")
    return role_name


async def resolve_active_role(db: AsyncSession, role: str | None) -> RoleModel:
    role_name = _normalize_role_name(role or "user")
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name, RoleModel.is_active == True))
    if not role_model:
        raise HTTPException(status_code=400, detail="Role not found or inactive")
    return role_model


def _normalize_resource_mapping_input(resource_type: str, resource_path: str) -> tuple[str, str]:
    normalized_type = resource_type.strip()
    normalized_path = resource_path.strip()
    if normalized_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid resource type")
    if not normalized_path or len(normalized_path) > 255:
        raise HTTPException(status_code=400, detail="Invalid resource path")
    if normalized_type == "frontend_page":
        if not normalized_path.startswith("/"):
            raise HTTPException(status_code=400, detail="Frontend page resources must start with /")
        if any(char.isspace() for char in normalized_path) or "?" in normalized_path or "#" in normalized_path:
            raise HTTPException(status_code=400, detail="Resource paths must not contain whitespace, query strings, or fragments")
    if normalized_type == "backend_api":
        method, separator, path = normalized_path.partition(" ")
        if not separator or method.upper() not in API_METHODS or not path.startswith("/api"):
            raise HTTPException(status_code=400, detail="Backend API resources must use 'METHOD /api/...' format")
        if any(char.isspace() for char in path) or "?" in path or "#" in path:
            raise HTTPException(status_code=400, detail="Resource paths must not contain whitespace, query strings, or fragments")
        normalized_path = f"{method.upper()} {path}"
    return normalized_type, normalized_path


async def _validate_permission_ids(db: AsyncSession, permission_ids: list[str]) -> list[str]:
    unique_permission_ids = list(dict.fromkeys(permission_ids))
    if unique_permission_ids:
        result = await db.execute(select(Permission.id).where(Permission.id.in_(unique_permission_ids)))
        found = set(result.scalars().all())
        missing = set(unique_permission_ids) - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Permission IDs not found: {sorted(missing)}")
    return unique_permission_ids


async def create_role(db: AsyncSession, body: RoleCreate) -> RoleDetailOut:
    role_name = _normalize_role_name(body.name)
    if role_name in PROTECTED_SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="System role names are reserved")
    if await db.scalar(select(RoleModel).where(RoleModel.name == role_name)):
        raise HTTPException(status_code=400, detail="Role already exists")
    permission_ids = await _validate_permission_ids(db, body.permission_ids)

    role_model = RoleModel(
        id=str(uuid.uuid4()),
        name=role_name,
        display_name=body.display_name,
        description=body.description,
        is_system=False,
        is_active=body.is_active,
    )
    db.add(role_model)
    await db.flush()
    for permission_id in permission_ids:
        db.add(RolePermission(id=str(uuid.uuid4()), role=role_name, role_id=role_model.id, permission_id=permission_id))
    await db.commit()
    return await get_role_detail(db, role_name)


async def update_role(db: AsyncSession, role: str, body: RoleUpdate) -> RoleDetailOut:
    role_name = _normalize_role_name(role)
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name))
    if not role_model:
        raise HTTPException(status_code=404, detail="Role not found")
    if body.display_name is not None:
        role_model.display_name = body.display_name
    if body.description is not None:
        role_model.description = body.description
    if body.is_active is not None:
        if role_name in PROTECTED_SYSTEM_ROLES and not body.is_active:
            raise HTTPException(status_code=403, detail="Cannot deactivate system role")
        role_model.is_active = body.is_active
    if body.permission_ids is not None:
        if role_name in PROTECTED_SYSTEM_ROLES:
            raise HTTPException(status_code=403, detail="Cannot update system role permissions")
        await _replace_role_permissions(db, role_name, role_model.id, body.permission_ids)
    await db.commit()
    return await get_role_detail(db, role_name)


async def delete_role(db: AsyncSession, role: str) -> None:
    role_name = _normalize_role_name(role)
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name))
    if not role_model:
        raise HTTPException(status_code=404, detail="Role not found")
    if role_name in PROTECTED_SYSTEM_ROLES:
        raise HTTPException(status_code=403, detail="Cannot delete system role")
    user_count = await db.scalar(select(func.count(User.id)).where((User.role_id == role_model.id) | (User.role == role_name))) or 0
    if user_count > 0:
        raise HTTPException(status_code=400, detail="Role is assigned to users")
    await db.execute(delete(RolePermission).where((RolePermission.role_id == role_model.id) | (RolePermission.role == role_name)))
    await db.delete(role_model)
    await db.commit()


async def _replace_role_permissions(db: AsyncSession, role: str, role_id: str | None, permission_ids: list[str]) -> None:
    unique_permission_ids = await _validate_permission_ids(db, permission_ids)
    if role_id:
        await db.execute(delete(RolePermission).where((RolePermission.role_id == role_id) | (RolePermission.role == role)))
    else:
        await db.execute(delete(RolePermission).where(RolePermission.role == role))
    for permission_id in unique_permission_ids:
        db.add(RolePermission(id=str(uuid.uuid4()), role=role, role_id=role_id, permission_id=permission_id))


async def update_role_permissions(db: AsyncSession, role: str, permission_ids: list[str]) -> RoleDetailOut:
    role_name = _normalize_role_name(role)
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name))
    if not role_model:
        raise HTTPException(status_code=404, detail="Role not found")
    if role_name in PROTECTED_SYSTEM_ROLES:
        raise HTTPException(status_code=403, detail="Cannot update system role permissions")
    await _replace_role_permissions(db, role_name, role_model.id, permission_ids)
    await db.commit()
    return await get_role_detail(db, role_name)


async def list_resource_mappings(db: AsyncSession, resource_type: str | None = None, permission_id: str | None = None) -> list[ResourceMappingOut]:
    query = select(ResourceMapping).options(selectinload(ResourceMapping.permission)).join(Permission, ResourceMapping.permission_id == Permission.id)
    if resource_type:
        query = query.where(ResourceMapping.resource_type == resource_type)
    if permission_id:
        query = query.where(ResourceMapping.permission_id == permission_id)
    result = await db.execute(query.order_by(ResourceMapping.resource_type, ResourceMapping.resource_path))
    return [resource_mapping_out(mapping) for mapping in result.scalars().all()]


async def create_resource_mapping(db: AsyncSession, permission_id: str, resource_type: str, resource_path: str) -> ResourceMappingOut:
    normalized_type, normalized_path = _normalize_resource_mapping_input(resource_type, resource_path)
    permission = await db.scalar(select(Permission).where(Permission.id == permission_id))
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    existing = await db.scalar(
        select(ResourceMapping).where(
            ResourceMapping.permission_id == permission_id,
            ResourceMapping.resource_type == normalized_type,
            ResourceMapping.resource_path == normalized_path,
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="Resource mapping already exists")

    mapping = ResourceMapping(
        id=str(uuid.uuid4()),
        permission_id=permission_id,
        resource_type=normalized_type,
        resource_path=normalized_path,
    )
    db.add(mapping)
    await db.commit()
    await db.refresh(mapping)
    mapping.permission = permission
    return resource_mapping_out(mapping)


async def delete_resource_mapping(db: AsyncSession, mapping_id: str) -> None:
    mapping = await db.scalar(select(ResourceMapping).where(ResourceMapping.id == mapping_id))
    if not mapping:
        raise HTTPException(status_code=404, detail="Resource mapping not found")
    await db.delete(mapping)
    await db.commit()


def discover_api_routes(app) -> set[str]:
    resources = set()
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            for method in sorted(route.methods - {"HEAD", "OPTIONS"}):
                path = route.path
                if path.startswith("/api"):
                    resources.add(f"{method} {path}")
    return resources


async def list_unmapped_resources(db: AsyncSession, app) -> list[UnmappedResourceOut]:
    registered_apis = discover_api_routes(app) - PUBLIC_API_RESOURCES
    mapped_api_result = await db.execute(select(ResourceMapping.resource_path).where(ResourceMapping.resource_type == "backend_api"))
    mapped_api_patterns = set(mapped_api_result.scalars().all())

    mapped_page_result = await db.execute(select(ResourceMapping.resource_path).where(ResourceMapping.resource_type == "frontend_page"))
    mapped_pages = set(mapped_page_result.scalars().all())

    unmapped = [
        UnmappedResourceOut(resource_type="backend_api", resource_path=resource, reason="No permission mapping found")
        for resource in sorted(registered_apis)
        if not any(match_api_resource(pattern, resource) for pattern in mapped_api_patterns)
    ]
    unmapped.extend(
        UnmappedResourceOut(resource_type="frontend_page", resource_path=path, reason="No permission mapping found")
        for path, _, _, _, _ in FRONTEND_ROUTES
        if path not in mapped_pages
    )
    return unmapped


async def get_user_permission_names(db: AsyncSession, user: User) -> list[str]:
    role = role_name_for(user)
    if is_admin_role(user):
        result = await db.execute(select(Permission.name).where(Permission.is_active == True))
        return sorted(result.scalars().all())

    query = (
        select(Permission.name)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(role_permission_filter(user))
        .where(Permission.is_active == True)
    )
    result = await db.execute(query)
    return sorted(set(result.scalars().all()))


def build_access_map(permission_names: list[str], role: str) -> dict[str, bool]:
    permission_set = set(permission_names)
    return {
        "canDashboardRead": role == "admin" or "dashboard:read" in permission_set,
        "canScanCreate": role == "admin" or "scan:create" in permission_set,
        "canScanExecute": role == "admin" or "scan:execute" in permission_set,
        "canReportRead": role == "admin" or "report:read" in permission_set,
        "canUserManage": role == "admin" or "user:manage" in permission_set,
        "canSettingsManage": role == "admin" or "settings:manage" in permission_set,
    }


def build_menu_items(permission_names: list[str], frontend_pages: list[str], role: str) -> list[MenuItemOut]:
    permission_set = set(permission_names)
    page_set = set(frontend_pages)
    system_children = []
    pentest_children = []
    for path, name, permission, icon, group in FRONTEND_ROUTES:
        if role == "admin" or permission is None or permission in permission_set or path in page_set:
            item = MenuItemOut(path=path, name=name, permission=permission, icon=icon, locale=name, access="canAccessPage")
            if group == "system":
                system_children.append(item)
            elif group == "pentest":
                pentest_children.append(item)
    menus = []
    if system_children:
        menus.append(MenuItemOut(path="/system-setting-group", name="sidebar.systemSettings", icon="SettingOutlined", locale="sidebar.systemSettings", children=system_children))
    if pentest_children:
        menus.append(MenuItemOut(path="/penetration-testing-group", name="sidebar.penetrationTesting", icon="BugOutlined", locale="sidebar.penetrationTesting", children=pentest_children))
    return menus
