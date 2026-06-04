"""
PTTechAI v3 - Database Configuration
PostgreSQL only
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from backend.common.config import settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Base class for all models"""
    pass


# Create async engine for PostgreSQL
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

# Alias for background tasks
async_session_factory = async_session_maker


async def get_db() -> AsyncSession:
    """Dependency to get database session"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def verify_rbac_role_schema(conn) -> None:
    """Verify RBAC role schema is present; schema changes are managed by Alembic."""
    checks = {
        "roles table": "SELECT to_regclass('public.roles') IS NOT NULL",
        "users.role_id": "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='role_id')",
        "role_permissions.role_id": "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='role_id')",
    }
    missing = []
    for name, sql in checks.items():
        if not await conn.scalar(text(sql)):
            missing.append(name)
    if missing:
        raise RuntimeError(
            "Database schema is missing RBAC role objects managed by Alembic: "
            + ", ".join(missing)
            + ". Run Alembic migrations before starting the application."
        )


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        logger.info("Using PostgreSQL database")
        # Create all tables from models for fresh development databases.
        # Existing schema migrations are managed by Alembic; no runtime DDL patching here.
        await conn.run_sync(Base.metadata.create_all)
        await verify_rbac_role_schema(conn)


async def close_db():
    """Close database connection"""
    await engine.dispose()
