import uuid
from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.permission import Permission, ResourceMapping, RolePermission
from backend.models.user import Role, User
from backend.schemas.rbac import MenuItemOut, PermissionOut, ResourceMappingOut, RoleDetailOut, RoleSummaryOut, UnmappedResourceOut

SYSTEM_ROLES = {"admin", "user", "viewer", "service"}
FRONTEND_ROUTES = [
    ("/", "sidebar.dashboard", "dashboard:read"),
    ("/auto", "sidebar.autoPentest", "agent:execute"),
    ("/scan/new", "sidebar.aiAgent", "scan:create"),
    ("/realtime", "sidebar.realtimeTask", "agent:execute"),
    ("/full-ia", "sidebar.fullIaTesting", "agent:execute"),
    ("/vuln-lab", "sidebar.vulnLab", "vulnerability:read"),
    ("/terminal", "sidebar.terminalAgent", "agent:execute"),
    ("/sandboxes", "sidebar.sandboxes", "agent:execute"),
    ("/tasks", "sidebar.taskLibrary", "agent:read"),
    ("/knowledge", "sidebar.knowledge", "knowledge:read"),
    ("/mcp", "sidebar.mcpServers", "settings:manage"),
    ("/providers", "sidebar.providers", "provider:read"),
    ("/scheduler", "sidebar.scheduler", "scheduler:read"),
    ("/reports", "sidebar.reports", "report:read"),
    ("/languages", "languageManagement.title", "settings:read"),
    ("/users", "usersManagement.title", "user:manage"),
    ("/roles", "roleManagement.title", "user:manage"),
    ("/unmapped-resources", "roleManagement.unmappedResources", "user:manage"),
    ("/settings", "sidebar.settings", "settings:read"),
    ("/profile", "profile.title", None),
]


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
    db_roles_result = await db.execute(select(RolePermission.role).distinct())
    user_roles_result = await db.execute(select(User.role).distinct())
    roles = set(db_roles_result.scalars().all()) | set(user_roles_result.scalars().all()) | SYSTEM_ROLES

    summaries = []
    for role in sorted(roles):
        user_count = await db.scalar(select(func.count(User.id)).where(User.role == role)) or 0
        permission_count = await db.scalar(select(func.count(RolePermission.id)).where(RolePermission.role == role)) or 0
        summaries.append(RoleSummaryOut(role=role, user_count=user_count, permission_count=permission_count))
    return summaries


async def get_role_detail(db: AsyncSession, role: str) -> RoleDetailOut:
    result = await db.execute(
        select(Permission)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role == role)
        .where(Permission.is_active == True)
        .order_by(Permission.scope, Permission.action, Permission.name)
    )
    permissions = [permission_out(permission) for permission in result.scalars().all()]
    return RoleDetailOut(role=role, permissions=permissions, total=len(permissions))


async def update_role_permissions(db: AsyncSession, role: str, permission_ids: list[str]) -> RoleDetailOut:
    if permission_ids:
        result = await db.execute(select(Permission.id).where(Permission.id.in_(permission_ids)))
        found = set(result.scalars().all())
        missing = set(permission_ids) - found
        if missing:
            raise HTTPException(status_code=400, detail=f"Permission IDs not found: {sorted(missing)}")

    await db.execute(delete(RolePermission).where(RolePermission.role == role))
    for permission_id in permission_ids:
        db.add(RolePermission(id=str(uuid.uuid4()), role=role, permission_id=permission_id))
    await db.commit()
    return await get_role_detail(db, role)


async def list_resource_mappings(db: AsyncSession, resource_type: str | None = None, permission_id: str | None = None) -> list[ResourceMappingOut]:
    query = select(ResourceMapping).join(Permission, ResourceMapping.permission_id == Permission.id)
    if resource_type:
        query = query.where(ResourceMapping.resource_type == resource_type)
    if permission_id:
        query = query.where(ResourceMapping.permission_id == permission_id)
    result = await db.execute(query.order_by(ResourceMapping.resource_type, ResourceMapping.resource_path))
    return [resource_mapping_out(mapping) for mapping in result.scalars().all()]


async def create_resource_mapping(db: AsyncSession, permission_id: str, resource_type: str, resource_path: str) -> ResourceMappingOut:
    permission = await db.scalar(select(Permission).where(Permission.id == permission_id))
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")

    existing = await db.scalar(
        select(ResourceMapping).where(
            ResourceMapping.permission_id == permission_id,
            ResourceMapping.resource_type == resource_type,
            ResourceMapping.resource_path == resource_path,
        )
    )
    if existing:
        raise HTTPException(status_code=400, detail="Resource mapping already exists")

    mapping = ResourceMapping(
        id=str(uuid.uuid4()),
        permission_id=permission_id,
        resource_type=resource_type,
        resource_path=resource_path,
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
    registered_apis = discover_api_routes(app)
    mapped_api_result = await db.execute(select(ResourceMapping.resource_path).where(ResourceMapping.resource_type == "backend_api"))
    mapped_apis = set(mapped_api_result.scalars().all())

    mapped_page_result = await db.execute(select(ResourceMapping.resource_path).where(ResourceMapping.resource_type == "frontend_page"))
    mapped_pages = set(mapped_page_result.scalars().all())

    unmapped = [
        UnmappedResourceOut(resource_type="backend_api", resource_path=resource, reason="No permission mapping found")
        for resource in sorted(registered_apis - mapped_apis)
    ]
    unmapped.extend(
        UnmappedResourceOut(resource_type="frontend_page", resource_path=path, reason="No permission mapping found")
        for path, _, _ in FRONTEND_ROUTES
        if path not in mapped_pages
    )
    return unmapped


async def get_user_permission_names(db: AsyncSession, user: User) -> list[str]:
    if user.role == Role.ADMIN:
        result = await db.execute(select(Permission.name).where(Permission.is_active == True))
        return sorted(result.scalars().all())

    role = user.role.value if hasattr(user.role, "value") else user.role
    result = await db.execute(
        select(Permission.name)
        .join(RolePermission, Permission.id == RolePermission.permission_id)
        .where(RolePermission.role == role)
        .where(Permission.is_active == True)
    )
    return sorted(result.scalars().all())


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
    menus = []
    for path, name, permission in FRONTEND_ROUTES:
        if role == "admin" or permission is None or permission in permission_set or path in page_set:
            menus.append(MenuItemOut(path=path, name=name, permission=permission))
    return menus
