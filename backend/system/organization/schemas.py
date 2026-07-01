"""Pydantic schemas for organization (tenant + department) management."""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Tenant ──
class TenantBase(BaseModel):
    name: str = Field(..., max_length=200)
    status: Optional[str] = Field(None, description="active / suspended")
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    expires_at: Optional[str] = None


class TenantCreate(TenantBase):
    code: str = Field(..., min_length=2, max_length=50, description="Unique tenant code")


class TenantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = None
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: Optional[bool] = None


class TenantResponse(BaseModel):
    id: str
    code: str
    name: str
    status: str
    logo_url: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    expires_at: Optional[str] = None
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    user_count: int = 0
    department_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class TenantListResponse(BaseModel):
    tenants: List[TenantResponse]
    total: int


class SetTenantAdminRequest(BaseModel):
    user_id: str = Field(..., description="User to promote/demote as tenant admin")
    is_tenant_admin: bool = Field(True, description="True to promote to tenant_admin, False to demote to user")


# ── Department ──
class DepartmentCreate(BaseModel):
    name: str = Field(..., max_length=100)
    parent_id: Optional[str] = None
    sort_order: int = 0
    description: Optional[str] = None
    tenant_id: Optional[str] = Field(None, description="Platform admin only; ignored for tenant admins")


class DepartmentUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    parent_id: Optional[str] = None
    sort_order: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentNode(BaseModel):
    id: str
    tenant_id: str
    parent_id: Optional[str] = None
    name: str
    sort_order: int
    description: Optional[str] = None
    is_active: bool
    user_count: int = 0
    children: List["DepartmentNode"] = []

    model_config = ConfigDict(from_attributes=True)


class DepartmentTreeResponse(BaseModel):
    departments: List[DepartmentNode]
    total: int


DepartmentNode.model_rebuild()
