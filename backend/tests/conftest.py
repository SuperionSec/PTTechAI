"""
PTTechAI Test Configuration
Shared fixtures for backend tests
"""
import pytest_asyncio
import sys
import uuid
from pathlib import Path

# Add project root to path for imports
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text

from backend.common.config import settings
from backend.common.db.database import Base, get_db
from backend.common.models.user import User, Role
from backend.common.models.permission import Permission, RolePermission, ResourceMapping, PermissionScope, PermissionAction
from backend.main import app


TEST_DATABASE_URL = settings.DATABASE_URL


@pytest_asyncio.fixture(scope="session")
async def engine():
    """Create a test database engine"""
    schema_name = f"test_backend_{uuid.uuid4().hex}"
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        future=True,
    )
    async with engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        await conn.execute(text(f'SET search_path TO "{schema_name}"'))
        await conn.run_sync(Base.metadata.create_all)
    yield engine, schema_name
    async with engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA "{schema_name}" CASCADE'))
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    """Create a fresh database session for each test"""
    engine_obj, schema_name = engine
    async_session = async_sessionmaker(
        engine_obj,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    async with async_session() as session:
        await session.execute(text(f'SET search_path TO "{schema_name}"'))
        yield session
        await session.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            await session.execute(table.delete())
        await session.commit()


@pytest_asyncio.fixture
async def admin_user(db_session):
    """Create an admin user"""
    user = User(
        id="test-admin-id",
        email="admin@test.com",
        hashed_password="hashed",
        full_name="Admin User",
        role=Role.ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def regular_user(db_session):
    """Create a regular user"""
    user = User(
        id="test-user-id",
        email="user@test.com",
        hashed_password="hashed",
        full_name="Regular User",
        role=Role.USER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def viewer_user(db_session):
    """Create a viewer user"""
    user = User(
        id="test-viewer-id",
        email="viewer@test.com",
        hashed_password="hashed",
        full_name="Viewer User",
        role=Role.VIEWER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def service_user(db_session):
    """Create a service user"""
    user = User(
        id="test-service-id",
        email="service@test.com",
        hashed_password="hashed",
        full_name="Service User",
        role=Role.SERVICE,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def scan_create_permission(db_session):
    """Create scan:create permission"""
    perm = Permission(
        id="perm-scan-create",
        name="scan:create",
        description="Create new scans",
        scope=PermissionScope.SCAN,
        action=PermissionAction.CREATE,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def scan_read_permission(db_session):
    """Create scan:read permission"""
    perm = Permission(
        id="perm-scan-read",
        name="scan:read",
        description="Read scan data",
        scope=PermissionScope.SCAN,
        action=PermissionAction.READ,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def user_manage_permission(db_session):
    """Create user:manage permission"""
    perm = Permission(
        id="perm-user-manage",
        name="user:manage",
        description="Manage users",
        scope=PermissionScope.USER,
        action=PermissionAction.MANAGE,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def scan_delete_permission(db_session):
    """Create scan:delete permission"""
    perm = Permission(
        id="perm-scan-delete",
        name="scan:delete",
        description="Delete scans",
        scope=PermissionScope.SCAN,
        action=PermissionAction.DELETE,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def scan_execute_permission(db_session):
    """Create scan:execute permission"""
    perm = Permission(
        id="perm-scan-execute",
        name="scan:execute",
        description="Execute scans",
        scope=PermissionScope.SCAN,
        action=PermissionAction.EXECUTE,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def report_read_permission(db_session):
    """Create report:read permission"""
    perm = Permission(
        id="perm-report-read",
        name="report:read",
        description="Read reports",
        scope=PermissionScope.REPORT,
        action=PermissionAction.READ,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def report_create_permission(db_session):
    """Create report:create permission"""
    perm = Permission(
        id="perm-report-create",
        name="report:create",
        description="Create reports",
        scope=PermissionScope.REPORT,
        action=PermissionAction.CREATE,
        is_active=True,
    )
    db_session.add(perm)
    await db_session.commit()
    return perm


@pytest_asyncio.fixture
async def user_with_scan_permissions(db_session, regular_user, scan_create_permission, scan_read_permission, scan_delete_permission, scan_execute_permission):
    """Create a regular user with scan permissions"""
    for perm in [scan_create_permission, scan_read_permission, scan_delete_permission, scan_execute_permission]:
        rp = RolePermission(id=f"rp-user-{perm.id}", role="user", permission_id=perm.id)
        db_session.add(rp)
    await db_session.commit()
    return regular_user


@pytest_asyncio.fixture
async def viewer_with_scan_read(db_session, viewer_user, scan_read_permission):
    """Create a viewer user with scan:read permission"""
    rp = RolePermission(id="rp-viewer-scan-read", role="viewer", permission_id=scan_read_permission.id)
    db_session.add(rp)
    await db_session.commit()
    return viewer_user


@pytest_asyncio.fixture
async def scan_api_mapping(db_session, scan_create_permission):
    """Create backend API mapping for scan:create"""
    mapping = ResourceMapping(
        id="map-scan-api",
        permission_id=scan_create_permission.id,
        resource_type="backend_api",
        resource_path="POST /api/v1/scans",
    )
    db_session.add(mapping)
    await db_session.commit()
    return mapping


@pytest_asyncio.fixture
async def scan_page_mapping(db_session, scan_create_permission):
    """Create frontend page mapping for scan:create"""
    mapping = ResourceMapping(
        id="map-scan-page",
        permission_id=scan_create_permission.id,
        resource_type="frontend_page",
        resource_path="/scan/new",
    )
    db_session.add(mapping)
    await db_session.commit()
    return mapping
