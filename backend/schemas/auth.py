"""
PTTechAI v3 - Authentication Schemas
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., description="User password")


class UserCreate(BaseModel):
    """Schema for user registration"""
    email: EmailStr = Field(..., description="User email")
    password: str = Field(..., min_length=6, description="User password (min 6 chars)")
    full_name: Optional[str] = Field(None, description="User full name")
    role: Optional[str] = Field(None, description="User role name")


class UserUpdate(BaseModel):
    """Schema for updating user information"""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[str] = None


class UserResponse(BaseModel):
    """Schema for user response (without sensitive data)"""
    id: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: Optional[str] = None
    last_login: Optional[str] = None

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True
