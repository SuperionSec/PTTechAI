"""
Initialize default permissions and role-permission mappings
PTTechAI v0.1.0 - RBAC Permission System
"""
import uuid
import asyncio
from sqlalchemy import select, delete, update
from backend.common.db.database import async_session_factory
from backend.common.models.permission import Permission, RolePermission, ResourceMapping, PermissionScope, PermissionAction
from backend.common.models.user import RoleModel, User
from backend.common.infra.rbac.policies import should_reset_role_permissions_on_startup


# Default permission definitions
DEFAULT_PERMISSIONS = [
    # Scan permissions
    {"name": "scan:create", "description": "Create new scans", "scope": PermissionScope.SCAN, "action": PermissionAction.CREATE},
    {"name": "scan:read", "description": "View scan results and details", "scope": PermissionScope.SCAN, "action": PermissionAction.READ},
    {"name": "scan:update", "description": "Update scan settings", "scope": PermissionScope.SCAN, "action": PermissionAction.UPDATE},
    {"name": "scan:delete", "description": "Delete scans", "scope": PermissionScope.SCAN, "action": PermissionAction.DELETE},
    {"name": "scan:execute", "description": "Start/stop scans", "scope": PermissionScope.SCAN, "action": PermissionAction.EXECUTE},

    # Target permissions
    {"name": "target:create", "description": "Add new targets", "scope": PermissionScope.TARGET, "action": PermissionAction.CREATE},
    {"name": "target:read", "description": "View targets", "scope": PermissionScope.TARGET, "action": PermissionAction.READ},
    {"name": "target:update", "description": "Update targets", "scope": PermissionScope.TARGET, "action": PermissionAction.UPDATE},
    {"name": "target:delete", "description": "Delete targets", "scope": PermissionScope.TARGET, "action": PermissionAction.DELETE},

    # Report permissions
    {"name": "report:create", "description": "Generate reports", "scope": PermissionScope.REPORT, "action": PermissionAction.CREATE},
    {"name": "report:read", "description": "View reports", "scope": PermissionScope.REPORT, "action": PermissionAction.READ},
    {"name": "report:delete", "description": "Delete reports", "scope": PermissionScope.REPORT, "action": PermissionAction.DELETE},

    # Vulnerability permissions
    {"name": "vulnerability:read", "description": "View vulnerabilities", "scope": PermissionScope.VULNERABILITY, "action": PermissionAction.READ},
    {"name": "vulnerability:update", "description": "Update vulnerability status", "scope": PermissionScope.VULNERABILITY, "action": PermissionAction.UPDATE},
    {"name": "vulnerability:delete", "description": "Delete vulnerabilities", "scope": PermissionScope.VULNERABILITY, "action": PermissionAction.DELETE},

    # Dashboard permissions
    {"name": "dashboard:read", "description": "Access dashboard", "scope": PermissionScope.DASHBOARD, "action": PermissionAction.READ},

    # Settings permissions
    {"name": "settings:read", "description": "View system settings", "scope": PermissionScope.SETTINGS, "action": PermissionAction.READ},
    {"name": "settings:update", "description": "Update system settings", "scope": PermissionScope.SETTINGS, "action": PermissionAction.UPDATE},
    {"name": "settings:manage", "description": "Full system management", "scope": PermissionScope.SETTINGS, "action": PermissionAction.MANAGE},

    # User management permissions (admin only)
    {"name": "user:create", "description": "Create users", "scope": PermissionScope.USER, "action": PermissionAction.CREATE},
    {"name": "user:read", "description": "View users", "scope": PermissionScope.USER, "action": PermissionAction.READ},
    {"name": "user:update", "description": "Update users", "scope": PermissionScope.USER, "action": PermissionAction.UPDATE},
    {"name": "user:delete", "description": "Delete users", "scope": PermissionScope.USER, "action": PermissionAction.DELETE},
    {"name": "user:manage", "description": "Full user management", "scope": PermissionScope.USER, "action": PermissionAction.MANAGE},

    # API Key permissions
    {"name": "api_key:create", "description": "Create API keys", "scope": PermissionScope.API_KEY, "action": PermissionAction.CREATE},
    {"name": "api_key:read", "description": "View API keys", "scope": PermissionScope.API_KEY, "action": PermissionAction.READ},
    {"name": "api_key:delete", "description": "Delete API keys", "scope": PermissionScope.API_KEY, "action": PermissionAction.DELETE},

    # Provider permissions
    {"name": "provider:read", "description": "View LLM providers", "scope": PermissionScope.PROVIDER, "action": PermissionAction.READ},
    {"name": "provider:update", "description": "Configure providers", "scope": PermissionScope.PROVIDER, "action": PermissionAction.UPDATE},
    {"name": "provider:manage", "description": "Full provider management", "scope": PermissionScope.PROVIDER, "action": PermissionAction.MANAGE},

    # Agent permissions
    {"name": "agent:read", "description": "View agent tasks", "scope": PermissionScope.AGENT, "action": PermissionAction.READ},
    {"name": "agent:execute", "description": "Run agent tasks", "scope": PermissionScope.AGENT, "action": PermissionAction.EXECUTE},

    # Scheduler permissions
    {"name": "scheduler:read", "description": "View scheduled tasks", "scope": PermissionScope.SCHEDULER, "action": PermissionAction.READ},
    {"name": "scheduler:manage", "description": "Manage scheduled tasks", "scope": PermissionScope.SCHEDULER, "action": PermissionAction.MANAGE},

    # Knowledge permissions
    {"name": "knowledge:read", "description": "View knowledge base", "scope": PermissionScope.KNOWLEDGE, "action": PermissionAction.READ},
    {"name": "knowledge:update", "description": "Update knowledge base", "scope": PermissionScope.KNOWLEDGE, "action": PermissionAction.UPDATE},

    # Vulnerability library permissions
    {"name": "vuln_library:read", "description": "View vulnerability library", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.READ},
    {"name": "vuln_library:create", "description": "Create vulnerability library entries", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.CREATE},
    {"name": "vuln_library:update", "description": "Update vulnerability library entries", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.UPDATE},
    {"name": "vuln_library:delete", "description": "Delete vulnerability library entries", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.DELETE},
    {"name": "vuln_library:manage", "description": "Manage vulnerability library categories", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.MANAGE},
    {"name": "vuln_library:read_exp", "description": "View EXP content", "scope": PermissionScope.VULN_LIBRARY, "action": PermissionAction.EXECUTE},
]

# Role-Permission mappings
DEFAULT_ROLES = {
    "admin": {"display_name": "Administrator", "description": "Full system administrator"},
    "user": {"display_name": "Standard User", "description": "Standard authenticated user"},
    "viewer": {"display_name": "Viewer", "description": "Read-only user"},
    "service": {"display_name": "Service Account", "description": "API-only service account"},
}

ROLE_PERMISSIONS = {
    "admin": [
        "scan:create", "scan:read", "scan:update", "scan:delete", "scan:execute",
        "target:create", "target:read", "target:update", "target:delete",
        "report:create", "report:read", "report:delete",
        "vulnerability:read", "vulnerability:update", "vulnerability:delete",
        "dashboard:read",
        "settings:read", "settings:update", "settings:manage",
        "user:create", "user:read", "user:update", "user:delete", "user:manage",
        "api_key:create", "api_key:read", "api_key:delete",
        "provider:read", "provider:update", "provider:manage",
        "agent:read", "agent:execute",
        "scheduler:read", "scheduler:manage",
        "knowledge:read", "knowledge:update",
        "vuln_library:read", "vuln_library:create", "vuln_library:update", "vuln_library:delete", "vuln_library:manage", "vuln_library:read_exp",
    ],
    "user": [
        "scan:create", "scan:read", "scan:update", "scan:delete", "scan:execute",
        "target:create", "target:read", "target:update", "target:delete",
        "report:create", "report:read", "report:delete",
        "vulnerability:read", "vulnerability:update",
        "dashboard:read",
        "settings:read",
        "api_key:create", "api_key:read", "api_key:delete",
        "provider:read",
        "agent:read", "agent:execute",
        "scheduler:read",
        "knowledge:read",
        "vuln_library:read",
    ],
    "viewer": [
        "scan:read",
        "target:read",
        "report:read",
        "vulnerability:read",
        "dashboard:read",
        "settings:read",
        "provider:read",
        "agent:read",
        "knowledge:read",
        "vuln_library:read",
    ],
    "service": [],
}

# Permission -> Frontend Pages mapping
PERMISSION_FRONTEND_PAGES = {
    "dashboard:read": ["/"],
    "scan:create": ["/scan/new"],
    "scan:read": ["/", "/scan/:scanId"],
    "scan:update": ["/scan/:scanId"],
    "scan:execute": ["/scan/:scanId"],
    "target:create": ["/scan/new"],
    "target:read": ["/scan/:scanId"],
    "target:update": ["/scan/:scanId"],
    "report:create": ["/reports"],
    "report:read": ["/reports", "/reports/:reportId"],
    "vulnerability:read": ["/vuln-lab", "/scan/:scanId"],
    "vulnerability:update": ["/vuln-lab"],
    "settings:read": ["/settings", "/languages"],
    "settings:update": ["/settings"],
    "settings:manage": ["/settings", "/languages", "/mcp", "/menus", "/audit", "/monitor"],
    "user:create": ["/users"],
    "user:read": ["/users", "/profile"],
    "user:update": ["/users"],
    "user:delete": ["/users"],
    "user:manage": ["/users", "/roles"],
    "api_key:create": ["/api-keys"],
    "api_key:read": ["/api-keys"],
    "api_key:delete": ["/api-keys"],
    "provider:read": ["/providers"],
    "provider:update": ["/providers"],
    "provider:manage": ["/providers"],
    "agent:read": ["/agent/:agentId", "/tasks", "/realtime"],
    "agent:execute": ["/auto", "/realtime", "/scan/new", "/full-ia", "/terminal", "/sandboxes"],
    "scheduler:read": ["/scheduler"],
    "scheduler:manage": ["/scheduler"],
    "knowledge:read": ["/knowledge"],
    "knowledge:update": ["/knowledge"],
    "vuln_library:read": ["/vulnerability-library/overview", "/vulnerability-library/entries", "/vulnerability-library/artifacts", "/vulnerability-library/identifiers", "/vulnerability-library/categories"],
    "vuln_library:manage": ["/vulnerability-library/categories"],
}

# Permission -> Backend APIs mapping
PERMISSION_BACKEND_APIS = {
    "scan:create": ["POST /api/v1/scans"],
    "scan:read": ["GET /api/v1/scans", "GET /api/v1/scans/*"],
    "scan:update": ["PUT /api/v1/scans/*"],
    "scan:delete": ["DELETE /api/v1/scans/*"],
    "scan:execute": ["POST /api/v1/scans/*"],
    "target:create": ["POST /api/v1/targets", "POST /api/v1/targets/*"],
    "target:read": ["GET /api/v1/targets", "GET /api/v1/targets/*"],
    "target:update": ["PUT /api/v1/targets/*"],
    "target:delete": ["DELETE /api/v1/targets/*"],
    "report:create": ["POST /api/v1/reports", "POST /api/v1/reports/*"],
    "report:read": ["GET /api/v1/reports", "GET /api/v1/reports/*"],
    "report:delete": ["DELETE /api/v1/reports/*"],
    "vulnerability:read": ["GET /api/v1/vulnerabilities", "GET /api/v1/vulnerabilities/*", "GET /api/v1/scans/vulnerabilities/learning/stats", "GET /api/v1/scans/*/vulnerabilities", "GET /api/v1/vuln-lab", "GET /api/v1/vuln-lab/*"],
    "vulnerability:update": ["PATCH /api/v1/scans/vulnerabilities/*", "POST /api/v1/scans/vulnerabilities/*/feedback", "POST /api/v1/vuln-lab/*"],
    "vulnerability:delete": ["DELETE /api/v1/vuln-lab/*"],
    "dashboard:read": ["GET /api/v1/dashboard/*"],
    "settings:read": ["GET /api/v1/settings", "GET /api/v1/settings/*"],
    "settings:update": ["PUT /api/v1/settings", "PUT /api/v1/settings/*"],
    "settings:manage": [
        "GET /api/docs",
        "GET /api/openapi.json",
        "GET /api/redoc",
        "GET /api/v1/mcp", "GET /api/v1/mcp/*",
        "POST /api/v1/mcp", "POST /api/v1/mcp/*",
        "PUT /api/v1/mcp/*",
        "DELETE /api/v1/mcp/*",
        "GET /api/v1/system", "GET /api/v1/system/*",
        "POST /api/v1/system/*",
        "PUT /api/v1/system/*",
        "DELETE /api/v1/system/*",
        "GET /api/v1/menus", "GET /api/v1/menus/*",
        "POST /api/v1/menus", "POST /api/v1/menus/*",
        "PUT /api/v1/menus/*",
        "DELETE /api/v1/menus/*",
        "GET /api/v1/audit", "GET /api/v1/audit/*",
        "GET /api/v1/monitor", "GET /api/v1/monitor/*",
        "POST /api/v1/settings/notifications/test/*",
        "POST /api/v1/settings/clear-database",
        "GET /api/v1/settings/models/*",
    ],
    "user:create": ["POST /api/v1/system/users"],
    "user:read": ["GET /api/v1/system/users", "GET /api/v1/system/users/*", "GET /api/v1/system/profile/me"],
    "user:update": ["PUT /api/v1/system/users/*", "PUT /api/v1/system/profile/me", "PUT /api/v1/system/profile/change-password"],
    "user:delete": ["DELETE /api/v1/system/users/*"],
    "user:manage": ["POST /api/v1/system/users/*/reset-password"],
    "api_key:create": ["POST /api/v1/api-keys", "POST /api/v1/system/api-keys"],
    "api_key:read": ["GET /api/v1/api-keys", "GET /api/v1/system/api-keys"],
    "api_key:delete": ["DELETE /api/v1/api-keys/*", "DELETE /api/v1/system/api-keys/*"],
    "provider:read": ["GET /api/v1/providers", "GET /api/v1/providers/status", "GET /api/v1/providers/available-models", "GET /api/v1/cli-agent/providers"],
    "provider:update": ["POST /api/v1/providers/detect-all", "POST /api/v1/providers/test/*", "POST /api/v1/providers/*/detect", "POST /api/v1/providers/*/connect", "POST /api/v1/providers/*/toggle"],
    "provider:manage": ["POST /api/v1/providers/*", "DELETE /api/v1/providers/*", "GET /api/v1/providers/env", "POST /api/v1/providers/env"],
    "agent:read": [
        "GET /api/v1/agent", "GET /api/v1/agent/*",
        "GET /api/v1/agent-tasks", "GET /api/v1/agent-tasks/*",
        "GET /api/v1/cli-agent/methodologies",
        "GET /api/v1/prompts", "GET /api/v1/prompts/*",
    ],
    "agent:execute": [
        "GET /api/v1/full-ia", "GET /api/v1/full-ia/*",
        "GET /api/v1/terminal", "GET /api/v1/terminal/*",
        "GET /api/v1/sandbox", "GET /api/v1/sandbox/*",
        "POST /api/v1/agent", "POST /api/v1/agent/*",
        "DELETE /api/v1/agent/*",
        "POST /api/v1/prompts", "POST /api/v1/prompts/*",
        "PUT /api/v1/prompts/*",
        "DELETE /api/v1/prompts/*",
        "POST /api/v1/agent-tasks", "DELETE /api/v1/agent-tasks/*",
        "POST /api/v1/full-ia", "POST /api/v1/full-ia/*",
        "POST /api/v1/terminal", "POST /api/v1/terminal/*",
        "DELETE /api/v1/terminal/*",
        "POST /api/v1/sandbox", "POST /api/v1/sandbox/*",
        "DELETE /api/v1/sandbox/*",
    ],
    "scheduler:read": ["GET /api/v1/scheduler", "GET /api/v1/scheduler/*"],
    "scheduler:manage": ["POST /api/v1/scheduler", "POST /api/v1/scheduler/*", "DELETE /api/v1/scheduler/*"],
    "knowledge:read": ["GET /api/v1/knowledge", "GET /api/v1/knowledge/*"],
    "knowledge:update": ["POST /api/v1/knowledge", "POST /api/v1/knowledge/*", "DELETE /api/v1/knowledge/*"],
    "vuln_library:read": [
        "GET /api/v1/vulnerability-library/stats",
        "GET /api/v1/vulnerability-library/entries",
        "GET /api/v1/vulnerability-library/entries/*",
        "GET /api/v1/vulnerability-library/identifiers",
        "GET /api/v1/vulnerability-library/artifacts",
        "GET /api/v1/vulnerability-library/artifacts/*",
        "GET /api/v1/vulnerability-library/categories",
    ],
    "vuln_library:create": [
        "POST /api/v1/vulnerability-library/entries",
        "POST /api/v1/vulnerability-library/entries/import",
        "POST /api/v1/vulnerability-library/entries/*/identifiers",
        "POST /api/v1/vulnerability-library/entries/*/artifacts",
    ],
    "vuln_library:update": [
        "PUT /api/v1/vulnerability-library/entries/*",
        "PUT /api/v1/vulnerability-library/identifiers/*",
        "DELETE /api/v1/vulnerability-library/identifiers/*",
        "PUT /api/v1/vulnerability-library/artifacts/*",
    ],
    "vuln_library:delete": [
        "DELETE /api/v1/vulnerability-library/entries/*",
        "DELETE /api/v1/vulnerability-library/artifacts/*",
    ],
    "vuln_library:manage": [
        "POST /api/v1/vulnerability-library/categories",
        "PUT /api/v1/vulnerability-library/categories/*",
        "DELETE /api/v1/vulnerability-library/categories/*",
    ],
}


async def init_permissions():
    """Initialize default permissions and role mappings"""
    async with async_session_factory() as db:
        role_map = {}
        for role_name, role_data in DEFAULT_ROLES.items():
            result = await db.execute(select(RoleModel).where(RoleModel.name == role_name))
            existing_role = result.scalar_one_or_none()
            if not existing_role:
                existing_role = RoleModel(
                    id=str(uuid.uuid4()),
                    name=role_name,
                    display_name=role_data["display_name"],
                    description=role_data["description"],
                    is_system=True,
                    is_active=True,
                )
                db.add(existing_role)
                await db.flush()
                print(f"[ROLE] Created: {role_name}")
            else:
                existing_role.display_name = role_data["display_name"]
                existing_role.description = role_data["description"]
                existing_role.is_system = True
                existing_role.is_active = True
            role_map[role_name] = existing_role.id

        await db.commit()

        # Create permissions
        permission_map = {}
        for perm_data in DEFAULT_PERMISSIONS:
            result = await db.execute(
                select(Permission).where(Permission.name == perm_data["name"])
            )
            existing = result.scalar_one_or_none()
            if not existing:
                perm = Permission(
                    id=str(uuid.uuid4()),
                    name=perm_data["name"],
                    description=perm_data["description"],
                    scope=perm_data["scope"],
                    action=perm_data["action"],
                )
                db.add(perm)
                await db.flush()
                permission_map[perm_data["name"]] = perm.id
                print(f"[PERMISSION] Created: {perm_data['name']}")
            else:
                permission_map[perm_data["name"]] = existing.id

        await db.commit()

        # Create role-permission mappings
        if should_reset_role_permissions_on_startup():
            for role_name, role_id in role_map.items():
                await db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))
            print("[ROLE_PERMISSION] Reset default role permissions because RBAC_RESET_ON_STARTUP=true")

        for role, perm_names in ROLE_PERMISSIONS.items():
            for perm_name in perm_names:
                perm_id = permission_map.get(perm_name)
                if not perm_id:
                    continue

                result = await db.execute(
                    select(RolePermission).where(
                        RolePermission.role_id == role_map.get(role),
                        RolePermission.permission_id == perm_id
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    rp = RolePermission(
                        id=str(uuid.uuid4()),
                        role_id=role_map.get(role),
                        permission_id=perm_id,
                    )
                    db.add(rp)
                    print(f"[ROLE_PERMISSION] Created: {role} -> {perm_name}")

        await db.commit()

        # Create resource mappings (frontend pages)
        for perm_name, pages in PERMISSION_FRONTEND_PAGES.items():
            perm_id = permission_map.get(perm_name)
            if not perm_id:
                continue

            for page_path in pages:
                result = await db.execute(
                    select(ResourceMapping).where(
                        ResourceMapping.permission_id == perm_id,
                        ResourceMapping.resource_type == "frontend_page",
                        ResourceMapping.resource_path == page_path
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    rm = ResourceMapping(
                        id=str(uuid.uuid4()),
                        permission_id=perm_id,
                        resource_type="frontend_page",
                        resource_path=page_path,
                    )
                    db.add(rm)
                    print(f"[RESOURCE_MAPPING] Created: {perm_name} -> frontend_page:{page_path}")

        provider_read_id = permission_map.get("provider:read")
        if provider_read_id:
            await db.execute(
                delete(ResourceMapping).where(
                    ResourceMapping.permission_id == provider_read_id,
                    ResourceMapping.resource_type == "backend_api",
                    ResourceMapping.resource_path == "GET /api/v1/providers/*"
                )
            )

        # Create resource mappings (backend APIs)
        for perm_name, apis in PERMISSION_BACKEND_APIS.items():
            perm_id = permission_map.get(perm_name)
            if not perm_id:
                continue

            for api_path in apis:
                result = await db.execute(
                    select(ResourceMapping).where(
                        ResourceMapping.permission_id == perm_id,
                        ResourceMapping.resource_type == "backend_api",
                        ResourceMapping.resource_path == api_path
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    rm = ResourceMapping(
                        id=str(uuid.uuid4()),
                        permission_id=perm_id,
                        resource_type="backend_api",
                        resource_path=api_path,
                    )
                    db.add(rm)
                    print(f"[RESOURCE_MAPPING] Created: {perm_name} -> backend_api:{api_path}")

        await db.commit()
        print("[PERMISSIONS] Initialization completed")


if __name__ == "__main__":
    asyncio.run(init_permissions())
