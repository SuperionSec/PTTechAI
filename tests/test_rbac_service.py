import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.pentest.backend.api.v1.permissions import (
    CreateResourceMappingRequest,
    UpdateRoleRequest,
    assign_permission_to_role as assign_legacy_permission_to_role,
    create_resource_mapping as create_legacy_resource_mapping,
    delete_resource_mapping as delete_legacy_resource_mapping,
    get_my_permissions as get_legacy_my_permissions,
    get_recommended_mappings,
    list_system_apis,
    list_unmapped_resources as list_legacy_unmapped_resources,
    revoke_permission_from_role as revoke_legacy_permission_from_role,
    update_role_permissions as update_legacy_role_permissions,
)
from backend.pentest.backend.api.v1.users import get_users
from backend.common.config import settings
from backend.common.infra.permissions import PermissionChecker, get_role_permissions as get_legacy_role_permissions, has_permission
from backend.common.infra.resource_guard import resource_guard
from backend.common.db.database import Base
import backend.pentest.backend.models
from backend.common.models.permission import Permission, PermissionAction, PermissionScope, ResourceMapping, RolePermission
from backend.common.models.user import RoleModel, User
from backend.common.schemas.rbac import RoleCreate, RoleUpdate
from backend.pentest.backend.services.rbac_service import (
    _normalize_resource_mapping_input,
    _normalize_role_name,
    build_menu_items,
    create_role,
    delete_role,
    get_role_detail,
    get_user_permission_names,
    list_roles,
    resolve_active_role,
    update_role,
    update_role_permissions,
)


class FakeDb:
    def __init__(self, scalar_value):
        self.scalar_value = scalar_value
        self.committed = False

    async def scalar(self, _query):
        return self.scalar_value

    async def commit(self):
        self.committed = True


class FakeRoleModel:
    def __init__(self, name="admin", is_system=True, is_active=True):
        self.id = "role-id"
        self.name = name
        self.display_name = "Administrator"
        self.description = None
        self.is_system = is_system
        self.is_active = is_active


@pytest_asyncio.fixture
async def db_session():
    schema_name = f"test_rbac_{uuid.uuid4().hex}"
    engine = create_async_engine(settings.DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        await conn.execute(text(f'SET search_path TO "{schema_name}"'))
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        await session.execute(text(f'SET search_path TO "{schema_name}"'))
        yield session

    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
    await engine.dispose()


async def _seed_permission(db: AsyncSession, permission_id: str = "perm-scan-read") -> Permission:
    permission = Permission(
        id=permission_id,
        name="scan:read",
        description="Read scans",
        scope=PermissionScope.SCAN,
        action=PermissionAction.READ,
        is_active=True,
    )
    db.add(permission)
    await db.commit()
    return permission


def test_normalize_role_name_lowercases_and_trims():
    assert _normalize_role_name("  Auditor_1  ") == "auditor_1"
    assert _normalize_role_name("SECURITY_TEAM") == "security_team"


@pytest.mark.parametrize("role_name", ["", "../admin", "admin/user", "admin-user", "admin user", "管理员", "a" * 51, "admin%2Fuser"])
def test_normalize_role_name_rejects_invalid_values(role_name):
    with pytest.raises(HTTPException) as exc_info:
        _normalize_role_name(role_name)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_role_allows_deactivating_preseeded_admin_role_flagged_system(db_session):
    db_session.add(RoleModel(id="admin-role-id", name="admin", display_name="Administrator", is_system=True, is_active=True))
    await db_session.commit()

    updated = await update_role(db_session, "ADMIN", RoleUpdate(is_active=False))

    assert not updated.is_active
    assert not updated.is_system


@pytest.mark.asyncio
async def test_resolve_active_role_defaults_to_user_role():
    db = FakeDb(FakeRoleModel(name="user", is_system=True, is_active=True))

    role_model = await resolve_active_role(db, None)

    assert role_model.name == "user"


@pytest.mark.asyncio
async def test_resolve_active_role_rejects_missing_role():
    db = FakeDb(None)

    with pytest.raises(HTTPException) as exc_info:
        await resolve_active_role(db, "unknown")

    assert exc_info.value.status_code == 400


def test_normalize_resource_mapping_input_normalizes_backend_method():
    assert _normalize_resource_mapping_input("backend_api", "get /api/v1/scans/*") == ("backend_api", "GET /api/v1/scans/*")


def test_normalize_resource_mapping_input_accepts_frontend_page():
    assert _normalize_resource_mapping_input("frontend_page", " /roles ") == ("frontend_page", "/roles")


@pytest.mark.parametrize(
    ("resource_type", "resource_path"),
    [
        ("backend", "GET /api/v1/scans"),
        ("backend_api", "TRACE /api/v1/scans"),
        ("backend_api", "GET /internal"),
        ("backend_api", "/api/v1/scans"),
        ("backend_api", "GET /api/v1/scans?limit=1"),
        ("backend_api", "GET /api/v1/scans#summary"),
        ("backend_api", "GET /api/v1/scans bad"),
        ("frontend_page", "roles"),
        ("frontend_page", "/roles?tab=users"),
        ("frontend_page", "/roles#users"),
        ("frontend_page", "/roles bad"),
        ("frontend_page", ""),
    ],
)
def test_normalize_resource_mapping_input_rejects_invalid_values(resource_type, resource_path):
    with pytest.raises(HTTPException) as exc_info:
        _normalize_resource_mapping_input(resource_type, resource_path)

    assert exc_info.value.status_code == 400


def test_access_helper_role_name_and_admin_detection():
    from backend.common.infra.rbac.access_helpers import is_admin_role, role_name_for
    from backend.common.models.user import Role

    admin = User(id="admin-id", email="admin@example.com", hashed_password="hashed", role=Role.ADMIN, is_active=True)
    custom = User(id="custom-id", email="custom@example.com", hashed_password="hashed", role="auditor", is_active=True)

    assert role_name_for(admin) == "admin"
    assert role_name_for(custom) == "auditor"
    assert is_admin_role(admin)
    assert not is_admin_role(custom)


def test_access_helper_role_permission_filter_includes_role_id_fallback():
    from backend.common.infra.rbac.access_helpers import role_permission_filter

    user = User(id="user-id", email="user@example.com", hashed_password="hashed", role="auditor", role_id="role-id", is_active=True)
    expression = str(role_permission_filter(user))

    assert "role_permissions.role_id" in expression
    assert "role_permissions.role" in expression


def test_access_helper_role_permission_filter_uses_role_without_role_id():
    from backend.common.infra.rbac.access_helpers import role_permission_filter

    user = User(id="user-id", email="user@example.com", hashed_password="hashed", role="auditor", is_active=True)
    expression = str(role_permission_filter(user))

    assert "role_permissions.role" in expression
    assert "role_permissions.role_id" not in expression


def test_build_menu_items_returns_grouped_pro_layout_contract():
    menus = build_menu_items(["user:manage", "settings:read"], ["/profile"], "user")

    assert [menu.path for menu in menus] == ["/system-setting-group", "/penetration-testing-group"]
    system_menu = menus[0]
    pentest_menu = menus[1]
    assert system_menu.icon == "SettingOutlined"
    assert system_menu.locale == "sidebar.systemSettings"
    assert [item.path for item in system_menu.children] == ["/users", "/roles", "/unmapped-resources", "/languages"]
    assert all(item.access == "canAccessPage" for item in system_menu.children)
    assert [item.path for item in pentest_menu.children] == ["/settings"]
    assert pentest_menu.children[0].icon == "SettingOutlined"


def test_build_menu_items_keeps_admin_access_to_all_groups():
    menus = build_menu_items([], [], "admin")

    paths = [item.path for menu in menus for item in menu.children]
    assert "/api-keys" not in paths
    assert "/profile" not in paths
    assert "/roles" in paths
    assert "/scheduler" in paths
    assert "/unmapped-resources" in paths


@pytest.mark.asyncio
async def test_create_role_persists_custom_role_permissions(db_session):
    permission = await _seed_permission(db_session)

    detail = await create_role(
        db_session,
        RoleCreate(
            name=" Security_Team ",
            display_name="Security Team",
            description="Custom security team",
            permission_ids=[permission.id],
        ),
    )

    assert detail.role == "security_team"
    assert detail.id is not None
    assert detail.permissions[0].name == "scan:read"

    role_model = await resolve_active_role(db_session, "security_team")
    role_permission = await db_session.scalar(select(RolePermission).where(RolePermission.role_id == role_model.id))
    assert role_permission.role == "security_team"
    assert role_permission.permission_id == permission.id


@pytest.mark.asyncio
async def test_create_role_accepts_max_length_custom_role_name(db_session):
    permission = await _seed_permission(db_session)
    role_name = "a" * 50

    role_detail = await create_role(db_session, RoleCreate(name=role_name, display_name="Long Role", permission_ids=[permission.id]))

    role_permission = await db_session.scalar(select(RolePermission).where(RolePermission.role_id == role_detail.id))
    assert role_detail.role == role_name
    assert role_permission.role == role_name


@pytest.mark.asyncio
async def test_admin_role_name_is_editable_like_other_preseeded_roles(db_session):
    permission = await _seed_permission(db_session)

    detail = await create_role(db_session, RoleCreate(name="admin", display_name="Admin", permission_ids=[permission.id]))
    assert detail.role == "admin"
    assert not detail.is_system

    updated = await update_role(db_session, "admin", RoleUpdate(display_name="Updated Admin", permission_ids=[]))
    assert updated.display_name == "Updated Admin"
    assert not updated.is_system


@pytest.mark.asyncio
async def test_default_example_role_names_are_editable_custom_roles(db_session):
    permission = await _seed_permission(db_session)

    for role_name in ["user", "viewer", "service"]:
        detail = await create_role(db_session, RoleCreate(name=role_name, display_name=role_name.title(), permission_ids=[permission.id]))
        assert detail.role == role_name
        assert not detail.is_system

        updated = await update_role(db_session, role_name, RoleUpdate(display_name=f"Updated {role_name}", permission_ids=[]))
        assert updated.display_name == f"Updated {role_name}"
        assert not updated.is_system


@pytest.mark.asyncio
async def test_preseeded_admin_marked_system_can_update_permissions(db_session):
    permission = await _seed_permission(db_session)
    db_session.add(RoleModel(id="admin-role-id", name="admin", display_name="Administrator", is_system=True, is_active=True))
    await db_session.commit()

    updated = await update_role(db_session, "admin", RoleUpdate(permission_ids=[permission.id]))

    assert not updated.is_system
    assert [permission.name for permission in updated.permissions] == ["scan:read"]


@pytest.mark.asyncio
async def test_legacy_example_role_marked_system_is_reported_editable(db_session):
    permission = await _seed_permission(db_session)
    db_session.add(RoleModel(id="user-role-id", name="user", display_name="Standard User", is_system=True, is_active=True))
    await db_session.commit()

    roles = await list_roles(db_session)
    user_summary = next(role for role in roles if role.role == "user")
    assert not user_summary.is_system

    detail = await get_role_detail(db_session, "user")
    assert not detail.is_system

    updated = await update_role_permissions(db_session, "user", [permission.id])
    assert [permission.name for permission in updated.permissions] == ["scan:read"]


@pytest.mark.asyncio
async def test_update_role_permissions_allows_preseeded_admin_marked_system(db_session):
    permission = await _seed_permission(db_session)
    db_session.add(RoleModel(id="admin-role-id", name="admin", display_name="Administrator", is_system=True, is_active=True))
    await db_session.commit()

    updated = await update_role_permissions(db_session, "admin", [permission.id])

    assert not updated.is_system
    assert [permission.name for permission in updated.permissions] == ["scan:read"]


@pytest.mark.asyncio
async def test_get_user_permission_names_reads_custom_role_id_permissions(db_session):
    permission = await _seed_permission(db_session)
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[permission.id]))
    user = User(
        id="user-id",
        email="auditor@example.com",
        hashed_password="hashed",
        role="auditor",
        role_id=role_detail.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    assert await get_user_permission_names(db_session, user) == ["scan:read"]


@pytest.mark.asyncio
async def test_resource_guard_reads_custom_role_id_permissions(db_session):
    permission = await _seed_permission(db_session)
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[permission.id]))
    user = User(
        id="user-id",
        email="auditor@example.com",
        hashed_password="hashed",
        role="auditor",
        role_id=role_detail.id,
        is_active=True,
    )
    db_session.add_all([
        user,
        ResourceMapping(id="map-scan-page", permission_id=permission.id, resource_type="frontend_page", resource_path="/scan/new"),
        ResourceMapping(id="map-scan-api", permission_id=permission.id, resource_type="backend_api", resource_path="GET /api/v1/scans"),
    ])
    await db_session.commit()

    permissions = await get_legacy_my_permissions(db_session, user)
    assert [permission.name for permission in permissions] == ["scan:read"]
    assert await resource_guard.get_accessible_pages(user, db_session) == ["/scan/new"]
    assert await resource_guard.get_accessible_apis(user, db_session) == ["GET /api/v1/scans"]


@pytest.mark.asyncio
async def test_legacy_permission_helpers_read_custom_role_id_permissions(db_session):
    permission = await _seed_permission(db_session)
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[permission.id]))
    user = User(
        id="user-id",
        email="auditor@example.com",
        hashed_password="hashed",
        role="auditor",
        role_id=role_detail.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()

    assert await has_permission(db_session, user, PermissionScope.SCAN, PermissionAction.READ)
    checker = PermissionChecker(user)
    await checker.load_permissions(db_session)
    assert checker.can(PermissionScope.SCAN, PermissionAction.READ)


@pytest.mark.asyncio
async def test_legacy_get_role_permissions_reads_role_id_only_permissions(db_session):
    permission = await _seed_permission(db_session)
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor"))
    await db_session.execute(delete(RolePermission).where(RolePermission.role_id == role_detail.id))
    db_session.add(RolePermission(id="role-permission-id", role="legacy_auditor", role_id=role_detail.id, permission_id=permission.id))
    await db_session.commit()

    permissions = await get_legacy_role_permissions(db_session, "auditor")

    assert [permission.name for permission in permissions] == ["scan:read"]


@pytest.mark.asyncio
async def test_get_users_filters_custom_persistent_roles(db_session):
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor"))
    auditor = User(
        id="auditor-user-id",
        email="auditor@example.com",
        hashed_password="hashed",
        role="auditor",
        role_id=role_detail.id,
        is_active=True,
    )
    other = User(
        id="other-user-id",
        email="other@example.com",
        hashed_password="hashed",
        role="viewer",
        is_active=True,
    )
    db_session.add_all([auditor, other])
    await db_session.commit()

    users = await get_users(role="auditor", current_user=None, db=db_session)

    assert [user.id for user in users] == ["auditor-user-id"]


@pytest.mark.asyncio
async def test_delete_role_rejects_role_assigned_to_user(db_session):
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor"))
    db_session.add(User(id="user-id", email="auditor@example.com", hashed_password="hashed", role="auditor", role_id=role_detail.id, is_active=True))
    await db_session.commit()

    with pytest.raises(HTTPException) as exc_info:
        await delete_role(db_session, "auditor")

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_role_removes_custom_role_and_permissions(db_session):
    permission = await _seed_permission(db_session)
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[permission.id]))

    await delete_role(db_session, "auditor")

    assert await db_session.get(RoleModel, role_detail.id) is None
    assert await db_session.scalar(select(RolePermission).where(RolePermission.role_id == role_detail.id)) is None


@pytest.mark.asyncio
async def test_create_role_deduplicates_permission_ids(db_session):
    permission = await _seed_permission(db_session)

    role_detail = await create_role(
        db_session,
        RoleCreate(name="auditor", display_name="Auditor", permission_ids=[permission.id, permission.id]),
    )

    role_permissions = (await db_session.execute(select(RolePermission).where(RolePermission.role_id == role_detail.id))).scalars().all()
    assert len(role_permissions) == 1
    assert role_permissions[0].permission_id == permission.id


@pytest.mark.asyncio
async def test_update_role_permissions_replaces_and_deduplicates_permission_ids(db_session):
    scan_read = await _seed_permission(db_session)
    user_manage = Permission(
        id="perm-user-manage",
        name="user:manage",
        description="Manage users",
        scope=PermissionScope.USER,
        action=PermissionAction.MANAGE,
        is_active=True,
    )
    db_session.add(user_manage)
    await db_session.commit()
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[scan_read.id]))

    updated = await update_role_permissions(db_session, "auditor", [user_manage.id, user_manage.id])

    role_permissions = (await db_session.execute(select(RolePermission).where(RolePermission.role_id == role_detail.id))).scalars().all()
    assert [permission.name for permission in updated.permissions] == ["user:manage"]
    assert len(role_permissions) == 1
    assert role_permissions[0].permission_id == user_manage.id


@pytest.mark.asyncio
async def test_update_role_permissions_rejects_missing_role(db_session):
    permission = await _seed_permission(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await update_role_permissions(db_session, "missing_role", [permission.id])

    assert exc_info.value.status_code == 404
    assert await db_session.scalar(select(RolePermission)) is None


@pytest.mark.asyncio
async def test_legacy_create_resource_mapping_reuses_rbac_validation(db_session):
    permission = await _seed_permission(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await create_legacy_resource_mapping(
            CreateResourceMappingRequest(
                permission_id=permission.id,
                resource_type="backend_api",
                resource_path="GET /api/v1/scans?limit=1",
            ),
            db_session,
            current_user=None,
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_legacy_create_resource_mapping_normalizes_backend_method(db_session):
    permission = await _seed_permission(db_session)

    mapping = await create_legacy_resource_mapping(
        CreateResourceMappingRequest(
            permission_id=permission.id,
            resource_type="backend_api",
            resource_path="get /api/v1/scans/*",
        ),
        db_session,
        current_user=None,
    )

    assert mapping.resource_path == "GET /api/v1/scans/*"


@pytest.mark.asyncio
async def test_legacy_delete_resource_mapping_uses_shared_not_found_behavior(db_session):
    with pytest.raises(HTTPException) as exc_info:
        await delete_legacy_resource_mapping("missing-mapping-id", db_session, current_user=None)

    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_legacy_unmapped_resources_honors_wildcard_backend_mappings(db_session):
    permission = await _seed_permission(db_session)
    db_session.add(
        ResourceMapping(
            id="wildcard-api-mapping",
            permission_id=permission.id,
            resource_type="backend_api",
            resource_path="GET /api/v1/permissions/*",
        )
    )
    await db_session.commit()

    unmapped = await list_legacy_unmapped_resources(db_session, current_user=None)

    assert "GET /api/v1/permissions/roles/{role}" not in {resource.resource_path for resource in unmapped}


@pytest.mark.asyncio
async def test_legacy_update_role_permissions_rejects_missing_role_without_orphans(db_session):
    permission = await _seed_permission(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await update_legacy_role_permissions(
            "missing_role",
            UpdateRoleRequest(permission_ids=[permission.id]),
            db_session,
            current_user=None,
        )

    assert exc_info.value.status_code == 404
    assert await db_session.scalar(select(RolePermission)) is None


@pytest.mark.asyncio
async def test_legacy_assign_permission_rejects_missing_role_without_orphans(db_session):
    permission = await _seed_permission(db_session)

    with pytest.raises(HTTPException) as exc_info:
        await assign_legacy_permission_to_role("missing_role", permission.id, db_session, current_user=None)

    assert exc_info.value.status_code == 404
    assert await db_session.scalar(select(RolePermission)) is None


@pytest.mark.asyncio
async def test_legacy_revoke_permission_updates_persistent_role_permissions(db_session):
    scan_read = await _seed_permission(db_session)
    user_manage = Permission(
        id="perm-user-manage",
        name="user:manage",
        description="Manage users",
        scope=PermissionScope.USER,
        action=PermissionAction.MANAGE,
        is_active=True,
    )
    db_session.add(user_manage)
    await db_session.commit()
    role_detail = await create_role(db_session, RoleCreate(name="auditor", display_name="Auditor", permission_ids=[scan_read.id, user_manage.id]))

    await revoke_legacy_permission_from_role("auditor", scan_read.id, db_session, current_user=None)

    role_permissions = (await db_session.execute(select(RolePermission).where(RolePermission.role_id == role_detail.id))).scalars().all()
    assert [role_permission.permission_id for role_permission in role_permissions] == [user_manage.id]


@pytest.mark.asyncio
async def test_legacy_recommended_mappings_use_shared_frontend_routes():
    recommendations = await get_recommended_mappings("api_key:read", current_user=None)

    assert recommendations["frontend_pages"] == ["/api-keys"]


@pytest.mark.asyncio
async def test_legacy_system_apis_reuses_shared_route_discovery():
    apis = await list_system_apis(current_user=None)
    api_by_path = {api.path: api for api in apis}

    assert "/api/v1/permissions/system/apis" in api_by_path
    assert "GET" in api_by_path["/api/v1/permissions/system/apis"].methods
    assert all("OPTIONS" not in api.methods for api in apis)
