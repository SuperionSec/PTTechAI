"""
PTTechAI v3 - Authentication and Security
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import secrets

from backend.config import settings
from backend.db.database import get_db, engine, ensure_rbac_role_schema
from backend.models.user import User, Role, APIKey
from backend.core.token_manager import is_token_revoked, update_token_last_used


# Use bcrypt for password hashing (passlib auto-verifies old sha256_crypt hashes via deprecated="auto")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


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


async def ensure_auth_schema_ready() -> None:
    from backend.db import database

    if database._rbac_schema_checked:
        return
    async with engine.begin() as conn:
        await ensure_rbac_role_schema(conn)
    database._rbac_schema_checked = True


async def get_user(db: AsyncSession, email: str) -> Optional[User]:
    """Get a user by email"""
    await ensure_auth_schema_ready()
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    """Get a user by ID"""
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def authenticate_user(db: AsyncSession, email: str, password: str) -> Optional[User]:
    """Authenticate a user by email and password"""
    user = await get_user(db, email)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
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


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """Dependency to get current user if authenticated, else None"""
    try:
        payload = decode_token(credentials.credentials)
        token_type = payload.get("type")
        if token_type != "access":
            return None
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
    except (JWTError, Exception):
        return None
    
    user = await get_user_by_id(db, user_id=user_id)
    if user is None or not user.is_active:
        return None
    return user


def require_role(*roles: Role):
    """Dependency factory to require specific role(s)"""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        # Handle both string and enum role values
        user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
        allowed_roles = [r.value if hasattr(r, 'value') else r for r in roles]
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker


def require_role_with_service(*roles: Role):
    """Dependency factory to require specific role(s), but also allow SERVICE role"""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
        allowed_roles = [r.value if hasattr(r, 'value') else r for r in roles]
        # SERVICE role is always allowed (for API access)
        if user_role == Role.SERVICE.value:
            return current_user
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker


def require_admin_or_service():
    """Dependency factory to require ADMIN or SERVICE role"""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = current_user.role.value if hasattr(current_user.role, 'value') else current_user.role
        if user_role not in [Role.ADMIN.value, Role.SERVICE.value]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin or service role required"
            )
        return current_user
    return role_checker


def generate_api_key() -> str:
    """Generate a secure API key"""
    return "nsk_" + secrets.token_urlsafe(32)


async def verify_api_key(db: AsyncSession, api_key: str) -> Optional[User]:
    """Verify an API key and return the associated user"""
    # Get all API keys and check against hash
    result = await db.execute(select(APIKey))
    api_keys = result.scalars().all()
    
    for key in api_keys:
        if pwd_context.verify(api_key, key.key_hash):
            # Update last_used timestamp
            key.last_used = datetime.now(timezone.utc).replace(tzinfo=None)
            await db.commit()
            # Check expiration
            if key.expires_at and datetime.now(timezone.utc).replace(tzinfo=None) > key.expires_at:
                return None
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
