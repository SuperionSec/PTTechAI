"""
Multi-tenant isolation tests.

Verifies the automatic ORM query filter (``tenant_query``), the write-time
tenant fill (``tenant_mixin``), and the data_scope helper. Uses an in-memory
SQLite database so these run without a live PostgreSQL (RLS is a PostgreSQL-only
defense-in-depth layer tested separately in an integration environment).
"""
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import String, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Mapped, DeclarativeBase, mapped_column

from backend.common.infra import tenant_query  # registers do_orm_execute listener
from backend.common.infra import tenant_mixin   # registers before_flush listener
from backend.common.infra.tenant_context import (
    TenantContextData,
    reset_tenant_context,
    set_tenant_context,
)
from backend.common.infra.tenant_query import apply_data_scope


class Base(DeclarativeBase):
    pass


# A minimal tenant-scoped model reusing a name from TENANT_SCOPED_TABLES so the
# listener recognises it. "scans" is in the isolation set.
class FakeScan(Base):
    __tablename__ = "scans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id: Mapped[str] = mapped_column(String(36), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(100))


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()
    reset_tenant_context()


def _ctx(tenant_id=None, user_id="u1", data_scope="tenant", platform=False, tenant_admin=False):
    return TenantContextData(
        user_id=user_id,
        tenant_id=tenant_id,
        data_scope=data_scope,
        is_platform_admin=platform,
        is_tenant_admin=tenant_admin,
    )


async def _seed(session):
    reset_tenant_context()  # no auto-fill during seeding
    session.add_all([
        FakeScan(id="a1", tenant_id="A", user_id="ua", name="scanA1"),
        FakeScan(id="a2", tenant_id="A", user_id="ua2", name="scanA2"),
        FakeScan(id="b1", tenant_id="B", user_id="ub", name="scanB1"),
    ])
    await session.commit()


@pytest.mark.asyncio
async def test_tenant_filter_restricts_rows(session):
    await _seed(session)
    set_tenant_context(_ctx(tenant_id="A"))
    try:
        rows = (await session.execute(select(FakeScan))).scalars().all()
    finally:
        reset_tenant_context()
    assert {r.id for r in rows} == {"a1", "a2"}


@pytest.mark.asyncio
async def test_platform_admin_sees_all(session):
    await _seed(session)
    set_tenant_context(_ctx(tenant_id=None, platform=True))
    try:
        rows = (await session.execute(select(FakeScan))).scalars().all()
    finally:
        reset_tenant_context()
    assert {r.id for r in rows} == {"a1", "a2", "b1"}


@pytest.mark.asyncio
async def test_no_context_no_filter(session):
    await _seed(session)
    reset_tenant_context()
    rows = (await session.execute(select(FakeScan))).scalars().all()
    assert {r.id for r in rows} == {"a1", "a2", "b1"}


@pytest.mark.asyncio
async def test_write_autofills_tenant_id(session):
    set_tenant_context(_ctx(tenant_id="A"))
    try:
        session.add(FakeScan(id="new1", user_id="ua", name="fresh"))
        await session.commit()
        # Read back as platform admin to bypass the filter
        set_tenant_context(_ctx(platform=True))
        row = (await session.execute(select(FakeScan).where(FakeScan.id == "new1"))).scalar_one()
        assert row.tenant_id == "A"
    finally:
        reset_tenant_context()


@pytest.mark.asyncio
async def test_data_scope_self(session):
    await _seed(session)
    ctx = _ctx(tenant_id="A", user_id="ua", data_scope="self")
    set_tenant_context(ctx)
    try:
        q = apply_data_scope(select(FakeScan), FakeScan, ctx)
        rows = (await session.execute(q)).scalars().all()
    finally:
        reset_tenant_context()
    # Only tenant A rows owned by ua
    assert {r.id for r in rows} == {"a1"}


def test_restrict_to_own_records_matrix():
    """Intra-tenant visibility helper honours new roles and data_scope."""
    from types import SimpleNamespace
    from backend.common.infra.rbac.access_helpers import restrict_to_own_records

    def fake_user(role, tenant_id, data_scope="self"):
        return SimpleNamespace(role=role, tenant_id=tenant_id, data_scope=data_scope)

    # platform admin (admin + no tenant): sees everything
    assert restrict_to_own_records(fake_user("admin", None)) is False
    # tenant admin: sees whole tenant
    assert restrict_to_own_records(fake_user("tenant_admin", "A")) is False
    # standard user with tenant-wide scope: sees whole tenant
    assert restrict_to_own_records(fake_user("user", "A", "tenant")) is False
    # standard user, self scope: own records only
    assert restrict_to_own_records(fake_user("user", "A", "self")) is True
    # viewer, department scope: still narrowed at user_id call sites
    assert restrict_to_own_records(fake_user("viewer", "A", "department")) is True

