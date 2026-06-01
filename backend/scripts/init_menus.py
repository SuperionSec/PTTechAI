"""
Menu Initialization Script
Migrates hardcoded FRONTEND_ROUTES and Sidebar nav groups to the menus table.
"""
import uuid
import logging
from typing import List, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.system.menu.models import Menu
from backend.system.rbac.service import FRONTEND_ROUTES

logger = logging.getLogger(__name__)

# Map Sidebar nav groups to their items
# This mirrors the structure in frontend/src/components/layout/Sidebar.tsx
SIDEBAR_GROUPS = [
    {
        "name": "sidebar.operations",
        "icon": "RocketOutlined",
        "sort_order": 10,
        "paths": ["/", "/auto", "/scan/new", "/realtime", "/full-ia"],
    },
    {
        "name": "sidebar.tools",
        "icon": "ToolOutlined",
        "sort_order": 20,
        "paths": ["/vuln-lab", "/terminal", "/sandboxes", "/tasks", "/knowledge", "/mcp", "/providers"],
    },
    {
        "name": "sidebar.configuration",
        "icon": "SettingOutlined",
        "sort_order": 30,
        "paths": ["/scheduler", "/reports", "/languages", "/users", "/roles", "/menus", "/audit", "/settings"],
    },
]


def _build_route_map() -> dict:
    """Build a map from path to FRONTEND_ROUTES entry."""
    route_map = {}
    for path, name, permission, icon, group in FRONTEND_ROUTES:
        route_map[path] = {
            "path": path,
            "name": name,
            "permission": permission,
            "icon": icon,
            "group": group,
        }
    return route_map


async def _menu_exists(db: AsyncSession) -> bool:
    """Check if any menus already exist."""
    result = await db.scalar(select(func.count(Menu.id)))
    return result > 0


async def init_menus(db: AsyncSession) -> int:
    """
    Initialize menus from FRONTEND_ROUTES and Sidebar groups.
    Returns the number of menus created.

    Skips if menus already exist (idempotent).
    """
    if await _menu_exists(db):
        logger.info("Menus already exist, skipping initialization")
        return 0

    route_map = _build_route_map()
    created_count = 0

    for group in SIDEBAR_GROUPS:
        # Create parent menu (group)
        parent_id = str(uuid.uuid4())
        parent_menu = Menu(
            id=parent_id,
            parent_id=None,
            name=group["name"],
            path=None,
            component=None,
            icon=group["icon"],
            sort_order=group["sort_order"],
            permission=None,
            is_visible=True,
            is_active=True,
        )
        db.add(parent_menu)
        created_count += 1

        # Create child menus for each path in the group
        child_sort = 10
        for path in group["paths"]:
            route = route_map.get(path)
            if not route:
                logger.warning(f"Path {path} not found in FRONTEND_ROUTES, skipping")
                continue

            child_menu = Menu(
                id=str(uuid.uuid4()),
                parent_id=parent_id,
                name=route["name"],
                path=route["path"],
                component=None,
                icon=route["icon"],
                sort_order=child_sort,
                permission=route["permission"],
                is_visible=True,
                is_active=True,
            )
            db.add(child_menu)
            created_count += 1
            child_sort += 10

    await db.commit()
    logger.info(f"Created {created_count} menus")
    return created_count


async def reset_menus(db: AsyncSession) -> int:
    """
    Delete all existing menus and re-initialize.
    Returns the number of menus created.
    """
    await db.execute(Menu.__table__.delete())
    await db.commit()
    logger.info("All menus deleted")
    return await init_menus(db)
