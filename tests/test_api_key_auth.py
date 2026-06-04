import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import backend.models  # noqa: F401
from backend.common.config import settings
from backend.common.db.database import Base
from backend.common.infra.auth import generate_api_key, get_api_key_digest, get_api_key_prefix, get_password_hash, verify_api_key
from backend.common.models.user import APIKey, RoleModel, User


@pytest_asyncio.fixture
async def db_session():
    schema_name = f"test_api_key_auth_{uuid.uuid4().hex}"
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


async def _create_user(db: AsyncSession, is_active: bool = True) -> User:
    role = RoleModel(id="role-admin", name="admin", display_name="Admin", is_active=True)
    user = User(id="user-id", email="admin@example.com", hashed_password=get_password_hash("password123"), role_id=role.id, is_active=is_active)
    db.add_all([role, user])
    await db.commit()
    return user


@pytest.mark.asyncio
async def test_new_api_key_uses_digest_lookup(db_session: AsyncSession):
    user = await _create_user(db_session)
    api_key = generate_api_key()
    record = APIKey(
        id="key-id",
        user_id=user.id,
        name="Test",
        key_hash=get_password_hash(api_key),
        key_prefix=get_api_key_prefix(api_key),
        key_digest=get_api_key_digest(api_key),
    )
    db_session.add(record)
    await db_session.commit()

    verified_user = await verify_api_key(db_session, api_key)
    assert verified_user is not None
    assert verified_user.id == user.id
    refreshed = await db_session.get(APIKey, record.id)
    assert refreshed.last_used is not None


@pytest.mark.asyncio
async def test_legacy_api_key_without_digest_falls_back_and_backfills(db_session: AsyncSession):
    user = await _create_user(db_session)
    api_key = generate_api_key()
    record = APIKey(id="legacy-key-id", user_id=user.id, name="Legacy", key_hash=get_password_hash(api_key))
    db_session.add(record)
    await db_session.commit()

    verified_user = await verify_api_key(db_session, api_key)
    assert verified_user is not None
    assert verified_user.id == user.id
    refreshed = await db_session.get(APIKey, record.id)
    assert refreshed.key_prefix == get_api_key_prefix(api_key)
    assert refreshed.key_digest == get_api_key_digest(api_key)


@pytest.mark.asyncio
async def test_api_key_rejects_wrong_expired_or_inactive_user(db_session: AsyncSession):
    user = await _create_user(db_session)
    api_key = generate_api_key()
    db_session.add(APIKey(
        id="expired-key",
        user_id=user.id,
        name="Expired",
        key_hash=get_password_hash(api_key),
        key_prefix=get_api_key_prefix(api_key),
        key_digest=get_api_key_digest(api_key),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1),
    ))
    await db_session.commit()
    assert await verify_api_key(db_session, api_key) is None
    assert await verify_api_key(db_session, "wrong-key") is None
