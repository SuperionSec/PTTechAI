"""
PTTechAI v3 - Database Configuration
PostgreSQL only
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from backend.config import settings

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


_rbac_schema_checked = False


async def ensure_rbac_role_schema(conn) -> None:
    await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS roles (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(50) UNIQUE NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            description VARCHAR(255),
            is_system BOOLEAN DEFAULT false NOT NULL,
            is_active BOOLEAN DEFAULT true NOT NULL,
            created_at TIMESTAMP DEFAULT now() NOT NULL,
            updated_at TIMESTAMP DEFAULT now() NOT NULL
        )
    """))
    await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id VARCHAR(36)"))
    await conn.execute(text("ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS role_id VARCHAR(36)"))


async def init_db():
    """Initialize database tables"""
    async with engine.begin() as conn:
        logger.info("Using PostgreSQL database")
        # Create all tables from models
        await conn.run_sync(Base.metadata.create_all)
        await ensure_rbac_role_schema(conn)
        global _rbac_schema_checked
        _rbac_schema_checked = True


async def close_db():
    """Close database connection"""
    await engine.dispose()
