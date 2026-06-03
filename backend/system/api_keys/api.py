"""
PTTechAI v3 - API Key Management Routes
"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.common.db.database import get_db
from backend.common.models.user import User, APIKey
from backend.common.schemas.auth import APIKeyCreate, APIKeyResponse
from backend.common.infra.auth import (
    get_current_user,
    generate_api_key,
    get_api_key_digest,
    get_api_key_prefix,
    get_password_hash
)
from backend.common.infra.resource_guard import require_api_permission
from backend.system.audit.service import record_audit_log

router = APIRouter()


@router.get("", response_model=List[APIKeyResponse], dependencies=[Depends(require_api_permission)])
async def get_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all API keys for the current user"""
    result = await db.execute(
        select(APIKey).where(APIKey.user_id == current_user.id)
    )
    api_keys = result.scalars().all()
    return api_keys


@router.post("", response_model=APIKeyResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_permission)])
async def create_api_key(
    api_key_data: APIKeyCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new API key"""
    # Generate API key and lookup metadata
    api_key = generate_api_key()
    key_hash = get_password_hash(api_key)
    key_prefix = get_api_key_prefix(api_key)
    key_digest = get_api_key_digest(api_key)
    
    # Create database entry
    db_api_key = APIKey(
        user_id=current_user.id,
        name=api_key_data.name,
        key_hash=key_hash,
        key_prefix=key_prefix,
        key_digest=key_digest,
        expires_at=api_key_data.expires_at
    )
    db.add(db_api_key)
    await db.flush()
    await record_audit_log(
        db,
        user=current_user,
        action="api_key.create",
        resource_type="api_key",
        resource_id=db_api_key.id,
        details={"name": db_api_key.name, "expires_at": str(db_api_key.expires_at) if db_api_key.expires_at else None},
        request=request,
    )
    await db.commit()
    await db.refresh(db_api_key)
    
    # Return response with the actual key (only once)
    return {
        "id": db_api_key.id,
        "name": db_api_key.name,
        "key": api_key,
        "created_at": db_api_key.created_at,
        "last_used": db_api_key.last_used,
        "expires_at": db_api_key.expires_at
    }


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_api_permission)])
async def delete_api_key(
    key_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an API key"""
    result = await db.execute(
        select(APIKey).where(
            APIKey.id == key_id,
            APIKey.user_id == current_user.id
        )
    )
    db_api_key = result.scalar_one_or_none()
    
    if not db_api_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found"
        )
    
    await record_audit_log(
        db,
        user=current_user,
        action="api_key.delete",
        resource_type="api_key",
        resource_id=db_api_key.id,
        details={"name": db_api_key.name},
        request=request,
    )
    await db.delete(db_api_key)
    await db.commit()
