"""
PTTechAI v3 - API Key Management Routes
"""
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.db.database import get_db
from backend.models.user import User, APIKey
from backend.schemas.auth import APIKeyCreate, APIKeyResponse
from backend.core.auth import (
    get_current_user,
    generate_api_key,
    get_password_hash
)
from backend.models.user import Role
from backend.core.resource_guard import require_api_permission

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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new API key"""
    # Generate API key and hash it
    api_key = generate_api_key()
    key_hash = get_password_hash(api_key)
    
    # Create database entry
    db_api_key = APIKey(
        user_id=current_user.id,
        name=api_key_data.name,
        key_hash=key_hash,
        expires_at=api_key_data.expires_at
    )
    db.add(db_api_key)
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
    
    await db.delete(db_api_key)
    await db.commit()
