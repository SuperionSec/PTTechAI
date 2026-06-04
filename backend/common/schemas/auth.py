"""
PTTechAI v3 - Authentication Schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, EmailStr


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")


class UserCreate(BaseModel):
    """Schema for user registration"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=8, description="User password (min 8 chars)")
    full_name: Optional[str] = Field(None, description="User full name")
    role: Optional[str] = Field(None, description="User role name")


class UserUpdate(BaseModel):
    """Schema for admin updating user information."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = Field(None, min_length=8)
    is_active: Optional[bool] = None
    role: Optional[str] = None


class UserProfileUpdate(BaseModel):
    """Schema for users updating their own profile."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    """Schema for admin password reset."""
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars)")


def user_to_response(user) -> "UserResponse":
    """Convert a User ORM object to UserResponse."""
    role = user.role_ref.name if getattr(user, "role_ref", None) else (user.role or "")
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=role,
        is_active=user.is_active,
        created_at=user.created_at.isoformat() if user.created_at else None,
        last_login=user.last_login.isoformat() if user.last_login else None,
    )


class UserResponse(BaseModel):
    """Schema for user response (without sensitive data)"""
    id: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Schema for token payload data"""
    user_id: Optional[str] = None
    email: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request"""
    refresh_token: str


class ChangePassword(BaseModel):
    """Schema for password change"""
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 chars)")


class APIKeyCreate(BaseModel):
    """Schema for creating API key"""
    name: str = Field(..., description="API key name/description")
    expires_at: Optional[datetime] = Field(None, description="Expiration date (optional)")


class APIKeyResponse(BaseModel):
    """Schema for API key response (includes the actual key once only)"""
    id: str
    name: str
    key: Optional[str] = None  # Only included when first created
    created_at: datetime
    last_used: Optional[datetime]
    expires_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
