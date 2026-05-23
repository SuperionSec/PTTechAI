"""
Initialize default permissions and role-permission mappings
PTTechAI v0.1.0 - RBAC Permission System
"""
import uuid
import asyncio
from sqlalchemy import select, delete
from backend.db.database import async_session_factory
from backend.models.permission import Permission, RolePermission, ResourceMapping, PermissionScope, PermissionAction


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
]

# Role-Permission mappings
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
    "settings:manage": ["/settings", "/languages"],
    "user:create": ["/users"],
    "user:read": ["/users", "/profile"],
    "user:update": ["/users"],
    "user:delete": ["/users"],
    "user:manage": ["/users", "/roles"],
    "api_key:create": ["/settings"],
    "api_key:read": ["/settings"],
    "api_key:delete": ["/settings"],
    "provider:read": ["/providers"],
    "provider:update": ["/providers"],
    "provider:manage": ["/providers"],
    "agent:read": ["/agent/:agentId", "/tasks", "/realtime"],
    "agent:execute": ["/auto", "/realtime", "/scan/new"],
    "scheduler:read": ["/scheduler"],
    "scheduler:manage": ["/scheduler"],
    "knowledge:read": ["/knowledge"],
    "knowledge:update": ["/knowledge"],
}

# Permission -> Backend APIs mapping
PERMISSION_BACKEND_APIS = {
    "scan:create": ["POST /api/v1/scans"],
    "scan:read": ["GET /api/v1/scans", "GET /api/v1/scans/{id}", "GET /api/v1/scans/{id}/status", "GET /api/v1/scans/{id}/endpoints"],
    "scan:update": ["PUT /api/v1/scans/{id}"],
    "scan:delete": ["DELETE /api/v1/scans/{id}"],
    "scan:execute": ["POST /api/v1/scans/{id}/start", "POST /api/v1/scans/{id}/stop", "POST /api/v1/scans/{id}/pause", "POST /api/v1/scans/{id}/resume"],
    "target:create": ["POST /api/v1/targets"],
    "target:read": ["GET /api/v1/targets"],
    "target:update": ["PUT /api/v1/targets/{id}"],
    "target:delete": ["DELETE /api/v1/targets/{id}"],
    "report:create": ["POST /api/v1/reports", "POST /api/v1/reports/ai-generate"],
    "report:read": ["GET /api/v1/reports", "GET /api/v1/reports/{id}", "GET /api/v1/reports/{id}/view", "GET /api/v1/reports/{id}/download/{format}", "GET /api/v1/reports/{id}/download-zip"],
    "report:delete": ["DELETE /api/v1/reports/{id}"],
    "vulnerability:read": ["GET /api/v1/vulnerabilities/*", "GET /api/v1/scans/{id}/vulnerabilities"],
    "vulnerability:update": ["PATCH /api/v1/scans/vulnerabilities/{id}/validate", "POST /api/v1/scans/vulnerabilities/{id}/feedback"],
    "vulnerability:delete": ["DELETE /api/v1/vuln-lab/challenges/{id}"],
    "dashboard:read": ["GET /api/v1/dashboard/*"],
    "settings:read": ["GET /api/v1/settings", "GET /api/v1/settings/stats", "GET /api/v1/settings/tools"],
    "settings:update": ["PUT /api/v1/settings"],
    "settings:manage": ["POST /api/v1/settings/notifications/test/*", "POST /api/v1/settings/clear-database", "GET /api/v1/settings/models/{provider}"],
    "user:create": ["POST /api/v1/users"],
    "user:read": ["GET /api/v1/users", "GET /api/v1/users/{id}", "GET /api/v1/users/me"],
    "user:update": ["PUT /api/v1/users/{id}"],
    "user:delete": ["DELETE /api/v1/users/{id}"],
    "user:manage": ["POST /api/v1/users/{id}/reset-password", "GET /api/v1/permissions/roles", "POST /api/v1/permissions/roles", "PUT /api/v1/permissions/roles/{role}", "DELETE /api/v1/permissions/roles/{role}"],
    "api_key:create": ["POST /api/v1/api-keys"],
    "api_key:read": ["GET /api/v1/api-keys"],
    "api_key:delete": ["DELETE /api/v1/api-keys/{id}"],
    "provider:read": ["GET /api/v1/providers", "GET /api/v1/providers/status", "GET /api/v1/providers/available-models"],
    "provider:update": ["POST /api/v1/providers/{id}/detect", "POST /api/v1/providers/{id}/connect", "POST /api/v1/providers/{id}/toggle"],
    "provider:manage": ["POST /api/v1/providers/detect-all", "DELETE /api/v1/providers/{id}/accounts/{account_id}", "POST /api/v1/providers/test/{id}/{account_id}", "GET /api/v1/providers/env", "POST /api/v1/providers/env"],
    "agent:read": [
        "GET /api/v1/agent/status",
        "GET /api/v1/agent/status/{agent_id}",
        "GET /api/v1/agent/active",
        "GET /api/v1/agent/history",
        "GET /api/v1/agent/by-scan/{scan_id}",
        "GET /api/v1/agent/md-agents",
        "GET /api/v1/agent/prompts/{agent_id}",
        "GET /api/v1/agent/logs/{agent_id}",
        "GET /api/v1/agent-tasks",
        "GET /api/v1/agent-tasks/summary",
        "GET /api/v1/agent-tasks/{task_id}",
        "GET /api/v1/agent-tasks/scan/{scan_id}/timeline",
    ],
    "agent:execute": [
        "POST /api/v1/agent/run",
        "POST /api/v1/agent/stop/{agent_id}",
        "POST /api/v1/agent/pause/{agent_id}",
        "POST /api/v1/agent/resume/{agent_id}",
        "POST /api/v1/agent/triple-check/{scan_id}",
        "POST /api/v1/agent/skip-to/{agent_id}/{target_phase}",
        "POST /api/v1/agent/prompt/{agent_id}",
    ],
    "scheduler:read": ["GET /api/v1/scheduler/*"],
    "scheduler:manage": ["POST /api/v1/scheduler/*", "DELETE /api/v1/scheduler/*", "POST /api/v1/scheduler/{id}/pause", "POST /api/v1/scheduler/{id}/resume"],
    "knowledge:read": ["GET /api/v1/knowledge/documents", "GET /api/v1/knowledge/documents/{id}", "GET /api/v1/knowledge/search", "GET /api/v1/knowledge/stats"],
    "knowledge:update": ["POST /api/v1/knowledge/upload", "DELETE /api/v1/knowledge/documents/{id}"],
}


async def init_permissions():
    """Initialize default permissions and role mappings"""
    async with async_session_factory() as db:
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
        # Clear old permissions for each role before assigning new ones
        for role_name in ROLE_PERMISSIONS.keys():
            await db.execute(delete(RolePermission).where(RolePermission.role == role_name))

        for role, perm_names in ROLE_PERMISSIONS.items():
            for perm_name in perm_names:
                perm_id = permission_map.get(perm_name)
                if not perm_id:
                    continue

                result = await db.execute(
                    select(RolePermission).where(
                        RolePermission.role == role,
                        RolePermission.permission_id == perm_id
                    )
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    rp = RolePermission(
                        id=str(uuid.uuid4()),
                        role=role,
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
