"""
PTTechAI v3 - Authentication API Routes
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import get_db
from backend.models.user import User, Role, RoleModel
from backend.schemas.auth import (
    UserLogin,
    UserCreate,
    UserUpdate,
    UserResponse,
    Token,
    RefreshTokenRequest,
    ChangePassword,
)
from backend.core.auth import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    get_current_user,
    get_user,
    get_user_by_id,
    decode_token,
    security,
)
from backend.core.token_manager import store_token, revoke_token, is_token_revoked
from backend.config import settings


def parse_device_info(user_agent: str | None) -> str | None:
    """Parse user agent string to get device info"""
    if not user_agent:
        return None
    user_agent_lower = user_agent.lower()
    if "mobile" in user_agent_lower or "android" in user_agent_lower or "iphone" in user_agent_lower:
        return "Mobile"
    return "Desktop"

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Register a new user (Admin only - public registration disabled)"""
    # Only admin can create new users
    if current_user.role != Role.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled. Please contact admin."
        )

    # Check if user already exists
    existing_user = await get_user(db, email=user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    role_value = Role(user_data.role) if user_data.role else Role.USER
    role_name = role_value.value if hasattr(role_value, "value") else role_value
    role_model = await db.scalar(select(RoleModel).where(RoleModel.name == role_name))
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=role_value,
        role_id=role_model.id if role_model else None,
        is_active=True,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return db_user


@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Login with email and password to get access and refresh tokens"""
    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()

    # Revoke all existing tokens for this user (single sign-on: new login invalidates old tokens)
    from backend.core.token_manager import revoke_all_user_tokens
    revoked_count = await revoke_all_user_tokens(db, user.id)
    if revoked_count > 0:
        print(f"[AUTH] Revoked {revoked_count} old tokens for user {user.email}")

    # Create tokens
    role_value = user.role.value if hasattr(user.role, 'value') else user.role
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": role_value})
    refresh_token = create_refresh_token(data={"sub": user.id})

    # Store tokens in database for revocation support
    access_payload = decode_token(access_token)
    refresh_payload = decode_token(refresh_token)

    # Get client info
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    device_info = parse_device_info(user_agent)
    login_method = "service" if user.role == Role.SERVICE else "password"

    await store_token(
        db=db,
        user_id=user.id,
        token_jti=access_payload.get("jti"),
        token_type="access",
        expires_at=datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
    )
    await store_token(
        db=db,
        user_id=user.id,
        token_jti=refresh_payload.get("jti"),
        token_type="refresh",
        expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Refresh access token using refresh token"""
    try:
        payload = decode_token(request.refresh_token)
        token_type = payload.get("type")
        if token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type"
            )
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials"
            )
        # Check if refresh token has been revoked
        if jti and await is_token_revoked(db, jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked"
            )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    user = await get_user_by_id(db, user_id=user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    # Revoke the old refresh token (one-time use)
    if jti:
        await revoke_token(db, jti)

    # Create new tokens
    role_value = user.role.value if hasattr(user.role, 'value') else user.role
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": role_value})
    refresh_token = create_refresh_token(data={"sub": user.id})

    # Store new tokens in database
    access_payload = decode_token(access_token)
    refresh_payload = decode_token(refresh_token)

    # Get client info
    client_host = http_request.client.host if http_request.client else None
    user_agent = http_request.headers.get("user-agent")
    device_info = parse_device_info(user_agent)
    login_method = "service" if user.role == Role.SERVICE else "password"

    await store_token(
        db=db,
        user_id=user.id,
        token_jti=access_payload.get("jti"),
        token_type="access",
        expires_at=datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
    )
    await store_token(
        db=db,
        user_id=user.id,
        token_jti=refresh_payload.get("jti"),
        token_type="refresh",
        expires_at=datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update current user information"""
    # Update fields if provided
    if user_data.email is not None:
        # Check if email is already taken by another user
        existing_user = await get_user(db, email=user_data.email)
        if existing_user and existing_user.id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        current_user.email = user_data.email
    
    if user_data.full_name is not None:
        current_user.full_name = user_data.full_name
    
    if user_data.password is not None:
        current_user.hashed_password = get_password_hash(user_data.password)
    
    await db.commit()
    await db.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.put("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change current user password"""
    from backend.core.auth import verify_password
    
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Update to new password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    await db.commit()
    
    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Logout - revoke current access token"""
    from backend.core.token_manager import revoke_token
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        if jti:
            await revoke_token(db, jti)
    except Exception:
        pass
    return {"message": "Logged out successfully"}


@router.post("/logout-all")
async def logout_all(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Logout from all other sessions except current one"""
    from backend.core.token_manager import revoke_all_user_tokens
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        revoked_count = await revoke_all_user_tokens(db, current_user.id, except_jti=jti)
        return {"message": f"Revoked {revoked_count} other sessions"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
