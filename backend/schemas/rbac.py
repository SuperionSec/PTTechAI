from typing import Optional
from pydantic import BaseModel


class PermissionOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    scope: str
    action: str
    is_active: bool


class RoleSummaryOut(BaseModel):
    role: str
    user_count: int
    permission_count: int


class RoleDetailOut(BaseModel):
    role: str
    permissions: list[PermissionOut]
    total: int


class ResourceMappingOut(BaseModel):
    id: str
    permission_id: str
    permission_name: Optional[str] = None
    resource_type: str
    resource_path: str
    version: int
    updated_at: Optional[str]


class ResourceMappingCreate(BaseModel):
    permission_id: str
    resource_type: str
    resource_path: str


class UnmappedResourceOut(BaseModel):
    resource_type: str
    resource_path: str
    reason: str


class MenuItemOut(BaseModel):
    path: str
    name: str
    permission: Optional[str] = None


class RbacMeOut(BaseModel):
    role: str
    permissions: list[str]
    frontend_pages: list[str]
    backend_apis: list[str]
    access: dict[str, bool]
    menus: list[MenuItemOut]
