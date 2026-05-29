"""
Token management for session tracking and revocation
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import uuid

from backend.models.user import UserToken


async def store_token(
    db: AsyncSession,
    user_id: str,
    token_jti: str,
    token_type: str,
    expires_at: datetime,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    device_info: Optional[str] = None,
    login_method: str = "password"
) -> UserToken:
    """Store a new token in the database"""
    token_record = UserToken(
        id=str(uuid.uuid4()),
        user_id=user_id,
        token_jti=token_jti,
        token_type=token_type,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
    )
    db.add(token_record)
    await db.commit()
    await db.refresh(token_record)
    return token_record


async def update_token_last_used(db: AsyncSession, token_jti: str) -> bool:
    """Update token last_used_at timestamp"""
    result = await db.execute(
        select(UserToken).where(
            and_(UserToken.token_jti == token_jti, UserToken.is_revoked == False)
        )
    )
    token = result.scalar_one_or_none()
    if token:
        token.last_used_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    return False


async def revoke_token(db: AsyncSession, token_jti: str) -> bool:
    """Revoke a token by its JTI"""
    result = await db.execute(
        select(UserToken).where(
            and_(UserToken.token_jti == token_jti, UserToken.is_revoked == False)
        )
    )
    token = result.scalar_one_or_none()
    if token:
        token.is_revoked = True
        token.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    return False


async def revoke_all_user_tokens(db: AsyncSession, user_id: str, except_jti: Optional[str] = None) -> int:
    """Revoke all tokens for a user, optionally except one"""
    result = await db.execute(
        select(UserToken).where(
            and_(
                UserToken.user_id == user_id,
                UserToken.is_revoked == False,
                UserToken.expires_at > datetime.now(timezone.utc)
            )
        )
    )
    tokens = result.scalars().all()
    revoked_count = 0
    for token in tokens:
        if except_jti and token.token_jti == except_jti:
            continue
        token.is_revoked = True
        token.revoked_at = datetime.now(timezone.utc)
        revoked_count += 1
    if revoked_count > 0:
        await db.commit()
    return revoked_count


async def is_token_revoked(db: AsyncSession, token_jti: str) -> bool:
    """Check if a token has been revoked"""
    result = await db.execute(
        select(UserToken).where(UserToken.token_jti == token_jti)
    )
    token = result.scalar_one_or_none()
    if not token:
        return False  # Token not in DB, assume valid (backward compatible)
    if token.is_revoked:
        return True
    if token.expires_at < datetime.now(timezone.utc):
        return True  # Expired
    return False


async def get_user_tokens(db: AsyncSession, user_id: str) -> list:
    """Get all active tokens for a user"""
    result = await db.execute(
        select(UserToken).where(
            and_(
                UserToken.user_id == user_id,
                UserToken.is_revoked == False,
                UserToken.expires_at > datetime.now(timezone.utc)
            )
        ).order_by(UserToken.created_at.desc())
    )
    return result.scalars().all()


async def cleanup_expired_tokens(db: AsyncSession) -> int:
    """Remove expired tokens from database"""
    result = await db.execute(
        select(UserToken).where(
            and_(
                UserToken.expires_at < datetime.now(timezone.utc),
                UserToken.is_revoked == True
            )
        )
    )
    tokens = result.scalars().all()
    count = len(tokens)
    for token in tokens:
        await db.delete(token)
    if count > 0:
        await db.commit()
    return count
