"""
PTTechAI v3 - Authentication API Routes
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from backend.common.db.database import get_db
from backend.common.models.user import User
from backend.common.schemas.auth import (
    UserLogin,
    UserCreate,
    UserUpdate,
    UserProfileUpdate,
    UserResponse,
    Token,
    RefreshTokenRequest,
    ChangePassword,
    user_to_response,
)
from backend.common.infra.auth import (
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
from backend.common.infra.token_manager import store_token, revoke_token, is_token_revoked
from backend.common.infra.rbac.access_helpers import is_admin_role, is_service_role, role_name_for
from backend.common.infra.rate_limiter import login_limiter, _client_ip
from backend.system.rbac.service import resolve_active_role
from backend.system.audit.service import record_audit_log
from backend.common.config import settings


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
    if not is_admin_role(current_user):
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
    role_model = await resolve_active_role(db, user_data.role)
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role_id=role_model.id,
        is_active=True,
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)

    return user_to_response(db_user)


@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Login with email and password to get access and refresh tokens"""
    # Rate limit by client IP to slow brute-force attacks
    rate_key = f"login:{_client_ip(request)}"
    if not login_limiter.is_allowed(rate_key):
        await record_audit_log(
            db,
            user=None,
            action="auth.rate_limited",
            resource_type="auth",
            details={"email": credentials.email},
            request=request,
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
            headers={"Retry-After": str(login_limiter.retry_after(rate_key))},
        )

    user = await authenticate_user(db, credentials.email, credentials.password)
    if not user:
        login_limiter.record_failure(rate_key)
        await record_audit_log(
            db,
            user=None,
            action="auth.login_failed",
            resource_type="auth",
            details={"email": credentials.email},
            request=request,
        )
        await db.commit()
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

    # Reject login when the user's tenant has been suspended/deactivated.
    # Platform-level users (tenant_id is NULL) are unaffected.
    if getattr(user, "tenant_id", None):
        from backend.system.organization.models import Tenant
        tenant = await db.get(Tenant, user.tenant_id)
        if tenant and (not tenant.is_active or tenant.status != "active"):
            await record_audit_log(
                db,
                user=None,
                action="auth.tenant_suspended",
                resource_type="auth",
                details={"email": credentials.email, "tenant_id": user.tenant_id},
                request=request,
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization has been suspended. Please contact your administrator."
            )

    # Successful authentication: clear throttling state for this IP
    login_limiter.record_success(rate_key)

    # Update last login
    user.last_login = datetime.now(timezone.utc).replace(tzinfo=None)

    # Revoke all existing tokens for this user (single sign-on: new login invalidates old tokens)
    from backend.common.infra.token_manager import revoke_all_user_tokens
    revoked_count = await revoke_all_user_tokens(db, user.id, commit=False)
    if revoked_count > 0:
        print(f"[AUTH] Revoked {revoked_count} old tokens for user {user.email}")

    # Create tokens
    role_value = role_name_for(user) or "user"
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": role_value})
    refresh_token = create_refresh_token(data={"sub": user.id})

    # Store tokens in database for revocation support
    access_payload = decode_token(access_token)
    refresh_payload = decode_token(refresh_token)

    # Get client info
    client_host = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    device_info = parse_device_info(user_agent)
    login_method = "service" if is_service_role(user) else "password"

    await store_token(
        db=db,
        user_id=user.id,
        token_jti=access_payload.get("jti"),
        token_type="access",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
        commit=False,
    )
    await store_token(
        db=db,
        user_id=user.id,
        token_jti=refresh_payload.get("jti"),
        token_type="refresh",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
        commit=False,
    )

    await record_audit_log(
        db,
        user=user,
        action="auth.login_success",
        resource_type="auth",
        details={"login_method": login_method, "device_info": device_info},
        request=request,
    )
    await db.commit()

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
        await revoke_token(db, jti, commit=False)

    # Create new tokens
    role_value = role_name_for(user) or "user"
    access_token = create_access_token(data={"sub": user.id, "email": user.email, "role": role_value})
    refresh_token = create_refresh_token(data={"sub": user.id})

    # Store new tokens in database
    access_payload = decode_token(access_token)
    refresh_payload = decode_token(refresh_token)

    # Get client info
    client_host = http_request.client.host if http_request.client else None
    user_agent = http_request.headers.get("user-agent")
    device_info = parse_device_info(user_agent)
    login_method = "service" if is_service_role(user) else "password"

    await store_token(
        db=db,
        user_id=user.id,
        token_jti=access_payload.get("jti"),
        token_type="access",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
        commit=False,
    )
    await store_token(
        db=db,
        user_id=user.id,
        token_jti=refresh_payload.get("jti"),
        token_type="refresh",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        ip_address=client_host,
        user_agent=user_agent,
        device_info=device_info,
        login_method=login_method,
        commit=False,
    )
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user information"""
    return user_to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    user_data: UserProfileUpdate,
    request: Request,
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
    
    await record_audit_log(
        db,
        user=current_user,
        action="profile.update",
        resource_type="profile",
        resource_id=current_user.id,
        details={"updated_fields": sorted(user_data.model_dump(exclude_unset=True).keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(current_user)

    return user_to_response(current_user)


@router.put("/change-password")
async def change_password(
    password_data: ChangePassword,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Change current user password"""
    from backend.common.infra.auth import verify_password
    
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Update to new password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    await record_audit_log(
        db,
        user=current_user,
        action="profile.change_password",
        resource_type="profile",
        resource_id=current_user.id,
        request=request,
    )
    await db.commit()
    
    return {"message": "Password changed successfully"}


@router.post("/logout")
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Logout - revoke current access token"""
    from backend.common.infra.token_manager import revoke_token
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        if jti:
            await revoke_token(db, jti, commit=False)
        await record_audit_log(
            db,
            user=current_user,
            action="auth.logout",
            resource_type="auth",
            details={"jti": jti},
            request=request,
        )
        await db.commit()
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
    from backend.common.infra.token_manager import revoke_all_user_tokens
    try:
        payload = decode_token(credentials.credentials)
        jti = payload.get("jti")
        revoked_count = await revoke_all_user_tokens(db, current_user.id, except_jti=jti, commit=False)
        await db.commit()
        return {"message": f"Revoked {revoked_count} other sessions"}
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to revoke sessions")
