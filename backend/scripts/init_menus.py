"""
Menu Initialization Script
Migrates hardcoded FRONTEND_ROUTES and Sidebar nav groups to the menus table.
"""
import uuid
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.system.menu.models import Menu, MenuType
from backend.system.rbac.service import FRONTEND_ROUTES

logger = logging.getLogger(__name__)

# Sidebar groups aligned with frontend routeConfig.tsx groups:
# pentest (penetrationTesting), apptest, vulnerabilityLibrary, system (systemSettings)
SIDEBAR_GROUPS = [
    {
        "name": "sidebar.penetrationTesting",
        "icon": "BugOutlined",
        "sort_order": 10,
        "paths": ["/", "/auto", "/scan/new", "/realtime", "/full-ia", "/vuln-lab", "/terminal", "/sandboxes", "/tasks", "/knowledge", "/mcp", "/providers", "/scheduler", "/reports", "/settings"],
    },
    {
        "name": "sidebar.apptest",
        "icon": "SafetyCertificateOutlined",
        "sort_order": 14,
        "paths": ["/apptest", "/apptest/statistics", "/apptest/config"],
    },
    {
        "name": "sidebar.vulnerabilityLibrary",
        "icon": "SafetyCertificateOutlined",
        "sort_order": 15,
        "paths": ["/vulnerability-library/overview", "/vulnerability-library/entries", "/vulnerability-library/artifacts", "/vulnerability-library/identifiers", "/vulnerability-library/categories"],
    },
    {
        "name": "sidebar.systemSettings",
        "icon": "SettingOutlined",
        "sort_order": 20,
        "paths": ["/users", "/roles", "/tenants", "/departments", "/menus", "/audit", "/sessions", "/monitor", "/languages"],
    },
]


def _build_route_map() -> dict:
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


async def _get_or_create_parent(db: AsyncSession, group: dict) -> tuple[Menu, bool]:
    result = await db.execute(select(Menu).where(Menu.parent_id.is_(None), Menu.name == group["name"]))
    parent = result.scalar_one_or_none()
    if parent:
        parent.icon = group["icon"]
        parent.sort_order = group["sort_order"]
        parent.menu_type = MenuType.DIRECTORY.value
        parent.is_visible = True
        parent.is_active = True
        return parent, False

    parent = Menu(
        id=str(uuid.uuid4()),
        parent_id=None,
        name=group["name"],
        path=None,
        component=None,
        icon=group["icon"],
        sort_order=group["sort_order"],
        menu_type=MenuType.DIRECTORY.value,
        permission=None,
        is_visible=True,
        is_active=True,
    )
    db.add(parent)
    await db.flush()
    return parent, True


async def _get_or_create_child(db: AsyncSession, parent: Menu, route: dict, sort_order: int) -> bool:
    result = await db.execute(select(Menu).where(Menu.path == route["path"]))
    child = result.scalar_one_or_none()
    if child:
        child.parent_id = parent.id
        child.name = route["name"]
        child.icon = route["icon"]
        child.menu_type = MenuType.MENU.value
        child.permission = route["permission"]
        child.sort_order = sort_order
        child.is_visible = True
        child.is_active = True
        return False

    child = Menu(
        id=str(uuid.uuid4()),
        parent_id=parent.id,
        name=route["name"],
        path=route["path"],
        component=None,
        icon=route["icon"],
        sort_order=sort_order,
        menu_type=MenuType.MENU.value,
        permission=route["permission"],
        is_visible=True,
        is_active=True,
    )
    db.add(child)
    return True


async def init_menus(db: AsyncSession) -> int:
    """
    Initialize or update menus from FRONTEND_ROUTES and Sidebar groups.
    Returns the number of newly created menus.

    This is idempotent and also backfills new routes added after the first run.
    """
    route_map = _build_route_map()
    created_count = 0

    for group in SIDEBAR_GROUPS:
        parent, parent_created = await _get_or_create_parent(db, group)
        if parent_created:
            created_count += 1

        child_sort = 10
        for path in group["paths"]:
            route = route_map.get(path)
            if not route:
                logger.warning(f"Path {path} not found in FRONTEND_ROUTES, skipping")
                continue
            if await _get_or_create_child(db, parent, route, child_sort):
                created_count += 1
            child_sort += 10

    await db.commit()
    logger.info(f"Menu initialization complete: {created_count} new menus created")
    return created_count


async def reset_menus(db: AsyncSession) -> int:
    await db.execute(Menu.__table__.delete())
    await db.commit()
    logger.info("All menus deleted")
    return await init_menus(db)
