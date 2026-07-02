"""
PTTechAI v3 - User Management API Routes (Admin Only)
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select

from backend.common.db.database import get_db
from backend.common.models.user import User
from backend.common.schemas.auth import UserResponse, UserListResponse, UserUpdate, UserCreate, ResetPasswordRequest, user_to_response
from backend.common.infra.auth import get_current_user, hash_new_password, get_user_by_id, get_user
from backend.common.infra.permissions import require_user_manage, require_user_read, require_user_create, require_user_update, require_user_delete
from backend.common.infra.rbac.access_helpers import is_platform_admin, can_assign_role
from backend.system.rbac.service import resolve_active_role
from backend.common.infra.rbac.access_helpers import role_name_for
from backend.system.audit.service import record_audit_log
from backend.system.organization.models import Department

router = APIRouter()


async def _resolve_org_assignment(
    db: AsyncSession,
    current_user: User,
    requested_tenant_id: Optional[str],
    requested_department_id: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """Resolve the tenant/department a managed user should be assigned to,
    enforcing that tenant admins can only operate within their own tenant.

    Returns (tenant_id, department_id).
    """
    if is_platform_admin(current_user):
        # Platform admin may assign any tenant / department.
        tenant_id = requested_tenant_id
    else:
        # Tenant admin: force the target into the operator's own tenant.
        tenant_id = getattr(current_user, "tenant_id", None)
        if requested_tenant_id and requested_tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="Cannot assign users to a different tenant")

    department_id = requested_department_id
    if department_id:
        dept = await db.get(Department, department_id)
        if not dept:
            raise HTTPException(status_code=400, detail="Department not found")
        if tenant_id and dept.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Department belongs to a different tenant")
        # If tenant not explicitly set, inherit from department.
        if not tenant_id:
            tenant_id = dept.tenant_id
    return tenant_id, department_id


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    request: Request,
    current_user: User = Depends(require_user_create()),
    db: AsyncSession = Depends(get_db)
):
    """Create a new user (Admin only)"""
    existing_user = await get_user(db, email=user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_password = hash_new_password(user_data.password, email=user_data.email)
    # Prevent privilege escalation: tenant admins cannot grant platform roles.
    if not can_assign_role(current_user, user_data.role):
        raise HTTPException(status_code=403, detail="Not allowed to assign this role")
    role_model = await resolve_active_role(db, user_data.role)
    tenant_id, department_id = await _resolve_org_assignment(
        db, current_user, user_data.tenant_id, user_data.department_id
    )
    db_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        phone=user_data.phone,
        remark=user_data.remark,
        role_id=role_model.id,
        tenant_id=tenant_id,
        department_id=department_id,
        data_scope=user_data.data_scope or "self",
        is_active=True,
    )
    db.add(db_user)
    await db.flush()
    await record_audit_log(
        db,
        user=current_user,
        action="user.create",
        resource_type="user",
        resource_id=db_user.id,
        details={"email": db_user.email, "role_id": db_user.role_id, "role": role_model.name, "tenant_id": tenant_id},
        request=request,
    )
    await db.commit()
    await db.refresh(db_user)

    db_user.role = role_model.name  # transient override so response has role without lazy-load
    return user_to_response(db_user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user info"""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=role_name_for(current_user) or "",
        is_active=current_user.is_active,
        tenant_id=getattr(current_user, "tenant_id", None),
        department_id=getattr(current_user, "department_id", None),
        data_scope=getattr(current_user, "data_scope", "self"),
        created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.get("", response_model=UserListResponse)
async def get_users(
    skip: int = 0,
    limit: int = 100,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
    tenant_id: Optional[str] = None,
    department_id: Optional[str] = None,
    current_user: User = Depends(require_user_read()),
    db: AsyncSession = Depends(get_db)
):
    """Get a paginated list of users (RuoYi-style: items + total).

    Platform admins see all users (optionally filtered by tenant_id).
    Tenant-scoped admins only see users within their own tenant.

    Accepts either ``page``/``page_size`` (preferred) or legacy ``skip``/``limit``.
    """
    from sqlalchemy import func

    base_filters = []
    if is_active is not None:
        base_filters.append(User.is_active == is_active)
    if role is not None:
        role_model = await resolve_active_role(db, role)
        base_filters.append(User.role_id == role_model.id)

    # Tenant scoping: the users table is not auto-filtered (platform admins
    # have no tenant), so enforce tenant boundaries explicitly here.
    if is_platform_admin(current_user):
        if tenant_id is not None:
            base_filters.append(User.tenant_id == tenant_id)
    else:
        own_tenant = getattr(current_user, "tenant_id", None)
        base_filters.append(User.tenant_id == own_tenant)
    if department_id is not None:
        base_filters.append(User.department_id == department_id)

    # Resolve paging: page/page_size take precedence over skip/limit.
    if page is not None or page_size is not None:
        eff_page = max(1, page or 1)
        eff_size = min(max(1, page_size or 20), 500)
        eff_skip = (eff_page - 1) * eff_size
        eff_limit = eff_size
    else:
        eff_skip = max(0, skip)
        eff_limit = min(max(1, limit), 500)
        eff_page = eff_skip // eff_limit + 1
        eff_size = eff_limit

    total = await db.scalar(
        select(func.count()).select_from(User).where(*base_filters)
    ) or 0

    query = (
        select(User)
        .options(selectinload(User.role_ref))
        .where(*base_filters)
        .order_by(User.created_at.desc())
        .offset(eff_skip)
        .limit(eff_limit)
    )
    result = await db.execute(query)
    users = result.scalars().all()

    items = [
        UserResponse(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            phone=u.phone,
            avatar=u.avatar,
            remark=u.remark,
            role=role_name_for(u) or "",
            is_active=u.is_active,
            tenant_id=u.tenant_id,
            department_id=u.department_id,
            data_scope=u.data_scope,
            created_at=u.created_at.isoformat() if u.created_at else None,
            last_login=u.last_login.isoformat() if u.last_login else None,
        )
        for u in users
    ]
    return UserListResponse(items=items, total=total, page=eff_page, page_size=eff_size)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id_route(
    user_id: str,
    current_user: User = Depends(require_user_read()),
    db: AsyncSession = Depends(get_db)
):
    """Get user by ID (Admin only)"""
    user = await get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    # Tenant admins can only view users within their own tenant.
    if not is_platform_admin(current_user):
        if user.tenant_id != getattr(current_user, "tenant_id", None):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role_name_for(user) or "",
        is_active=user.is_active,
        tenant_id=user.tenant_id,
        department_id=user.department_id,
        data_scope=user.data_scope,
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    request: Request,
    current_user: User = Depends(require_user_update()),
    db: AsyncSession = Depends(get_db)
):
    """Update user by ID (Admin only)"""
    user = await get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Tenant admins may only modify users within their own tenant.
    if not is_platform_admin(current_user):
        if user.tenant_id != getattr(current_user, "tenant_id", None):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Update fields if provided
    if user_data.email is not None:
        existing_user = await get_user(db, email=user_data.email)
        if existing_user and existing_user.id != user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        user.email = user_data.email

    if user_data.full_name is not None:
        user.full_name = user_data.full_name

    if user_data.phone is not None:
        user.phone = user_data.phone

    if user_data.remark is not None:
        user.remark = user_data.remark

    if user_data.password is not None:
        user.hashed_password = hash_new_password(user_data.password, email=user.email)

    if user_data.is_active is not None:
        user.is_active = user_data.is_active

    updated_role_name = None
    if user_data.role is not None:
        # Prevent privilege escalation: tenant admins cannot grant platform roles.
        if not can_assign_role(current_user, user_data.role):
            raise HTTPException(status_code=403, detail="Not allowed to assign this role")
        role_model = await resolve_active_role(db, user_data.role)
        user.role_id = role_model.id
        updated_role_name = role_model.name

    # Organization assignment (tenant / department), scoped to caller's authority.
    if user_data.tenant_id is not None or user_data.department_id is not None:
        new_tenant_id, new_department_id = await _resolve_org_assignment(
            db, current_user, user_data.tenant_id, user_data.department_id
        )
        if user_data.tenant_id is not None:
            user.tenant_id = new_tenant_id
        if user_data.department_id is not None:
            user.department_id = new_department_id
    if user_data.data_scope is not None:
        user.data_scope = user_data.data_scope

    updated_fields = sorted(user_data.model_dump(exclude_unset=True).keys())
    await record_audit_log(
        db,
        user=current_user,
        action="user.update",
        resource_type="user",
        resource_id=user.id,
        details={"updated_fields": updated_fields, "email": user.email},
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=updated_role_name or role_name_for(user) or "",
        is_active=user.is_active,
        tenant_id=user.tenant_id,
        department_id=user.department_id,
        data_scope=user.data_scope,
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    request: Request,
    current_user: User = Depends(require_user_delete()),
    db: AsyncSession = Depends(get_db)
):
    """Delete user by ID (Admin only)"""
    # Prevent admin from deleting themselves
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = await get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Tenant admins may only delete users within their own tenant, and never a
    # platform-level user (tenant_id is NULL).
    if not is_platform_admin(current_user):
        if user.tenant_id is None or user.tenant_id != getattr(current_user, "tenant_id", None):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await record_audit_log(
        db,
        user=current_user,
        action="user.delete",
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email},
        request=request,
    )
    await db.delete(user)
    await db.commit()

    return None


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    request: Request,
    body: ResetPasswordRequest,
    current_user: User = Depends(require_user_manage()),
    db: AsyncSession = Depends(get_db)
):
    """Reset user password (Admin only)"""
    user = await get_user_by_id(db, user_id=user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Tenant admins may only reset passwords for users within their own tenant.
    if not is_platform_admin(current_user):
        if user.tenant_id is None or user.tenant_id != getattr(current_user, "tenant_id", None):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Policy-validate against the target user's email, then invalidate their sessions.
    user.hashed_password = hash_new_password(body.new_password, email=user.email)
    if hasattr(user, "pwd_update_date"):
        from datetime import datetime, timezone
        user.pwd_update_date = datetime.now(timezone.utc).replace(tzinfo=None)
    from backend.common.infra.token_manager import revoke_all_user_tokens
    await revoke_all_user_tokens(db, user.id, commit=False)
    await record_audit_log(
        db,
        user=current_user,
        action="user.reset_password",
        resource_type="user",
        resource_id=user.id,
        details={"email": user.email},
        request=request,
    )
    await db.commit()
    
    return {"message": "Password reset successfully"}
