"""
PTTechAI v3 - Authentication and Security
"""
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
from typing import Optional
import bcrypt
from passlib.hash import sha256_crypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import uuid
import secrets

from backend.common.config import settings
from backend.common.db.database import get_db
from backend.common.models.user import User, APIKey
from backend.common.infra.token_manager import is_token_revoked, update_token_last_used
from backend.common.infra.rbac.access_helpers import is_admin_role, is_service_role


security = HTTPBearer()


def identify_hash(hashed_password: str) -> str:
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        return "bcrypt"
    if hashed_password.startswith("$5$"):
        return "sha256_crypt"
    return "unknown"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password or secret against supported hash formats."""
    hash_type = identify_hash(hashed_password)
    if hash_type == "bcrypt":
        return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())
    if hash_type == "sha256_crypt":
        return sha256_crypt.verify(plain_password, hashed_password)
    return False


def password_needs_rehash(hashed_password: str) -> bool:
    return identify_hash(hashed_password) != "bcrypt"


def get_password_hash(password: str) -> str:
    """Hash a password or secret with native bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token with JTI for revocation support"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc).replace(tzinfo=None) + expires_delta
    else:
        expire = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    jti = str(uuid.uuid4())
    to_encode.update({"exp": expire, "type": "access", "jti": jti})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT refresh token with JTI for revocation support"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc).replace(tzinfo=None) + expires_delta
    else:
        expire = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    jti = str(uuid.uuid4())
    to_encode.update({"exp": expire, "type": "refresh", "jti": jti})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_user(db: AsyncSession, email: str) -> Optional[User]:
    """Get a user by email"""
    result = await db.execute(select(User).options(selectinload(User.role_ref)).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    """Get a user by ID"""
    result = await db.execute(select(User).options(selectinload(User.role_ref)).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password"""
    user = await get_user(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if password_needs_rehash(user.hashed_password):
        user.hashed_password = get_password_hash(password)
        await db.flush()
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency to get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        token_type = payload.get("type")
        if token_type != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        email: str = payload.get("email")
        jti: str = payload.get("jti")
        if user_id is None:
            raise credentials_exception
        # Check if token has been revoked
        if jti and await is_token_revoked(db, jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        raise credentials_exception

    user = await get_user_by_id(db, user_id=user_id)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")

    # Update token last used timestamp (fire and forget)
    if jti:
        try:
            await update_token_last_used(db, jti)
        except Exception:
            pass  # Don't fail request if update fails

    return user


def require_role(*roles: str):
    """Dependency factory to require specific role name(s)."""
    allowed_roles = [role.value if hasattr(role, "value") else role for role in roles]
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role_ref is None or current_user.role_ref.name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker


def require_role_with_service(*roles: str):
    """Dependency factory to require specific role name(s), but also allow service role."""
    allowed_roles = [role.value if hasattr(role, "value") else role for role in roles]
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        role_name = current_user.role_ref.name if current_user.role_ref else None
        if role_name == "service":
            return current_user
        if role_name not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker


def require_admin_or_service():
    """Dependency factory to require admin or service role."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if not (is_admin_role(current_user) or is_service_role(current_user)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin or service role required"
            )
        return current_user
    return role_checker


def generate_api_key() -> str:
    """Generate a secure API key"""
    return "nsk_" + secrets.token_urlsafe(32)


def get_api_key_prefix(api_key: str) -> str:
    """Return a non-secret lookup prefix for an API key."""
    return api_key[:12]


def get_api_key_digest(api_key: str) -> str:
    """Return deterministic HMAC digest used for API key lookup."""
    return hmac.new(settings.SECRET_KEY.encode(), api_key.encode(), hashlib.sha256).hexdigest()


async def verify_api_key(db: AsyncSession, api_key: str) -> Optional[User]:
    """Verify an API key and return the associated user."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    key_digest = get_api_key_digest(api_key)
    result = await db.execute(
        select(APIKey)
        .options(selectinload(APIKey.user).selectinload(User.role_ref))
        .where(APIKey.key_digest == key_digest)
    )
    candidates = list(result.scalars().all())

    # Backward compatibility for legacy keys without deterministic lookup columns.
    if not candidates:
        legacy_result = await db.execute(
            select(APIKey)
            .options(selectinload(APIKey.user).selectinload(User.role_ref))
            .where(APIKey.key_digest.is_(None))
        )
        candidates = list(legacy_result.scalars().all())

    for key in candidates:
        if hmac.compare_digest(key.key_digest or key_digest, key_digest) and verify_password(api_key, key.key_hash):
            if key.expires_at and now > key.expires_at:
                return None
            key.key_prefix = key.key_prefix or get_api_key_prefix(api_key)
            key.key_digest = key.key_digest or key_digest
            key.last_used = now
            await db.commit()
            return key.user
    return None


async def get_current_user_from_api_key(
    x_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> User:
    """Dependency to get current user from API key header"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key"
    )
    if not x_api_key:
        raise credentials_exception
    
    user = await verify_api_key(db, x_api_key)
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
    x_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Optional dependency to get current user (either from JWT or API key)"""
    # Try JWT first
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            token_type = payload.get("type")
            if token_type == "access":
                user_id: str = payload.get("sub")
                user = await get_user_by_id(db, user_id=user_id)
                if user and user.is_active:
                    return user
        except HTTPException:
            pass
    
    # Try API key
    if x_api_key:
        user = await verify_api_key(db, x_api_key)
        if user and user.is_active:
            return user
    
    return None
