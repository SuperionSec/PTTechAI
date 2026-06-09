"""
Menu Management Schemas
PTTechAI v3 - Pydantic schemas for menu CRUD operations
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class MenuCreate(BaseModel):
    """Schema for creating a menu"""
    parent_id: Optional[str] = Field(None, description="Parent menu ID (null for root menu)")
    name: str = Field(..., min_length=1, max_length=100, description="Menu display name")
    path: Optional[str] = Field(None, max_length=255, description="Frontend route path")
    component: Optional[str] = Field(None, max_length=255, description="Frontend component path")
    icon: Optional[str] = Field(None, max_length=50, description="Icon name")
    sort_order: int = Field(0, description="Sort order (ascending)")
    menu_type: str = Field("menu", description="Menu type: directory/menu/button")
    permission: Optional[str] = Field(None, max_length=100, description="Required permission")
    is_visible: bool = Field(True, description="Show in menu")
    is_active: bool = Field(True, description="Menu is enabled")


class MenuUpdate(BaseModel):
    """Schema for updating a menu"""
    parent_id: Optional[str] = Field(None, description="Parent menu ID")
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Menu display name")
    path: Optional[str] = Field(None, max_length=255, description="Frontend route path")
    component: Optional[str] = Field(None, max_length=255, description="Frontend component path")
    icon: Optional[str] = Field(None, max_length=50, description="Icon name")
    sort_order: Optional[int] = Field(None, description="Sort order")
    menu_type: Optional[str] = Field(None, description="Menu type: directory/menu/button")
    permission: Optional[str] = Field(None, max_length=100, description="Required permission")
    is_visible: Optional[bool] = Field(None, description="Show in menu")
    is_active: Optional[bool] = Field(None, description="Menu is enabled")


class MenuResponse(BaseModel):
    """Schema for menu response (single item)"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: Optional[str]
    name: str
    path: Optional[str]
    component: Optional[str]
    icon: Optional[str]
    sort_order: int
    menu_type: str = "menu"
    permission: Optional[str]
    is_visible: bool
    is_active: bool
    created_at: str
    updated_at: str


class MenuTreeNode(BaseModel):
    """Schema for menu tree node (with children)"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_id: Optional[str]
    name: str
    path: Optional[str]
    component: Optional[str]
    icon: Optional[str]
    sort_order: int
    menu_type: str = "menu"
    permission: Optional[str]
    is_visible: bool
    is_active: bool
    children: List["MenuTreeNode"] = []


class MenuListResponse(BaseModel):
    """Schema for menu list response"""
    menus: List[MenuResponse]
    total: int


class MenuTreeResponse(BaseModel):
    """Schema for menu tree response"""
    menus: List[MenuTreeNode]
    total: int
