"""
Menu Management API Endpoints
PTTechAI v3 - Dynamic menu system with tree structure
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from backend.common.db.database import get_db
from backend.common.models.user import User
from backend.common.infra.auth import get_current_user
from backend.common.infra.permissions import require_permission_name
from backend.common.infra.resource_guard import resource_guard
from backend.common.infra.rbac.access_helpers import is_admin_role
from backend.system.audit.service import record_audit_log

from .models import Menu, MenuType
from .schemas import (
    MenuCreate,
    MenuUpdate,
    MenuResponse,
    MenuTreeNode,
    MenuListResponse,
    MenuTreeResponse,
)

router = APIRouter()


def _menu_to_response(menu: Menu) -> MenuResponse:
    """Convert Menu model to response schema"""
    return MenuResponse(
        id=menu.id,
        parent_id=menu.parent_id,
        name=menu.name,
        path=menu.path,
        component=menu.component,
        icon=menu.icon,
        sort_order=menu.sort_order,
        menu_type=menu.menu_type or MenuType.MENU.value,
        permission=menu.permission,
        is_visible=menu.is_visible,
        is_active=menu.is_active,
        created_at=menu.created_at.isoformat() if menu.created_at else "",
        updated_at=menu.updated_at.isoformat() if menu.updated_at else "",
    )


def _build_tree(menus: List[Menu], user_permissions: Optional[set] = None, is_admin: bool = False) -> List[MenuTreeNode]:
    """Build menu tree from flat list.

    - admin users: skip permission filtering
    - button type menus: excluded from navigation tree
    """
    # Filter out button-type menus (only for permission checks, not navigation)
    menus = [m for m in menus if (m.menu_type or MenuType.MENU.value) != MenuType.BUTTON.value]

    # Filter by permission if user_permissions provided and not admin
    if not is_admin and user_permissions is not None:
        menus = [
            m for m in menus
            if not m.permission or m.permission in user_permissions
        ]

    # Build node map
    node_map = {}
    for menu in menus:
        node_map[menu.id] = MenuTreeNode(
            id=menu.id,
            parent_id=menu.parent_id,
            name=menu.name,
            path=menu.path,
            component=menu.component,
            icon=menu.icon,
            sort_order=menu.sort_order,
            menu_type=menu.menu_type or MenuType.MENU.value,
            permission=menu.permission,
            is_visible=menu.is_visible,
            is_active=menu.is_active,
            children=[],
        )

    # Build tree
    roots = []
    for node in node_map.values():
        if node.parent_id is None:
            roots.append(node)
        elif node.parent_id in node_map:
            node_map[node.parent_id].children.append(node)

    # Sort by sort_order
    def sort_children(node: MenuTreeNode):
        node.children.sort(key=lambda x: x.sort_order)
        for child in node.children:
            sort_children(child)

    for root in roots:
        sort_children(root)

    roots.sort(key=lambda x: x.sort_order)
    return roots


@router.get("", response_model=MenuListResponse)
async def list_menus(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """List all menus (admin only)"""
    result = await db.execute(select(Menu).order_by(Menu.sort_order))
    menus = result.scalars().all()
    return MenuListResponse(
        menus=[_menu_to_response(m) for m in menus],
        total=len(menus),
    )


@router.get("/tree", response_model=MenuTreeResponse)
async def get_menu_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """Get menu tree structure (admin only)"""
    result = await db.execute(select(Menu).order_by(Menu.sort_order))
    menus = result.scalars().all()
    tree = _build_tree(list(menus))
    return MenuTreeResponse(menus=tree, total=len(tree))


@router.get("/user", response_model=MenuTreeResponse)
async def get_user_menu_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get menu tree for current user (filtered by permissions)"""
    # Get user permissions
    permissions = await resource_guard.get_user_permissions(current_user, db)
    permission_names = {p.name for p in permissions}
    is_admin = is_admin_role(current_user)

    # Get all active and visible menus
    result = await db.execute(
        select(Menu)
        .where(Menu.is_active.is_(True))
        .where(Menu.is_visible.is_(True))
        .order_by(Menu.sort_order)
    )
    menus = result.scalars().all()

    # Build tree with permission filter (admin skips filtering)
    tree = _build_tree(list(menus), user_permissions=permission_names, is_admin=is_admin)
    return MenuTreeResponse(menus=tree, total=len(tree))


@router.post("", response_model=MenuResponse, status_code=status.HTTP_201_CREATED)
async def create_menu(
    data: MenuCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """Create a new menu (admin only)"""
    # Validate parent exists if provided
    if data.parent_id:
        parent = await db.get(Menu, data.parent_id)
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent menu with id '{data.parent_id}' not found",
            )

    menu = Menu(
        id=str(uuid.uuid4()),
        parent_id=data.parent_id,
        name=data.name,
        path=data.path,
        component=data.component,
        icon=data.icon,
        sort_order=data.sort_order,
        menu_type=data.menu_type,
        permission=data.permission,
        is_visible=data.is_visible,
        is_active=data.is_active,
    )
    db.add(menu)
    await record_audit_log(
        db,
        user=current_user,
        action="menu.create",
        resource_type="menu",
        resource_id=menu.id,
        details={"name": menu.name, "path": menu.path, "parent_id": menu.parent_id},
        request=request,
    )
    await db.commit()
    await db.refresh(menu)
    return _menu_to_response(menu)


@router.get("/{menu_id}", response_model=MenuResponse)
async def get_menu(
    menu_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """Get a menu by ID (admin only)"""
    menu = await db.get(Menu, menu_id)
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu with id '{menu_id}' not found",
        )
    return _menu_to_response(menu)


@router.put("/{menu_id}", response_model=MenuResponse)
async def update_menu(
    menu_id: str,
    data: MenuUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """Update a menu (admin only)"""
    menu = await db.get(Menu, menu_id)
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu with id '{menu_id}' not found",
        )

    # Prevent self-reference
    if data.parent_id == menu_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Menu cannot be its own parent",
        )

    # Validate parent exists if provided
    if data.parent_id:
        parent = await db.get(Menu, data.parent_id)
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Parent menu with id '{data.parent_id}' not found",
            )

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(menu, field, value)

    await record_audit_log(
        db,
        user=current_user,
        action="menu.update",
        resource_type="menu",
        resource_id=menu.id,
        details={"updated_fields": sorted(update_data.keys())},
        request=request,
    )
    await db.commit()
    await db.refresh(menu)
    return _menu_to_response(menu)


@router.delete("/{menu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu(
    menu_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission_name("settings:manage")),
):
    """Delete a menu and its children (admin only)"""
    menu = await db.get(Menu, menu_id)
    if not menu:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Menu with id '{menu_id}' not found",
        )

    await record_audit_log(
        db,
        user=current_user,
        action="menu.delete",
        resource_type="menu",
        resource_id=menu.id,
        details={"name": menu.name, "path": menu.path},
        request=request,
    )
    await db.delete(menu)
    await db.commit()
    return None
