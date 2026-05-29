from dataclasses import dataclass

from fastapi import FastAPI

from backend.pentest.backend.api.v1 import (
    agent,
    agent_tasks,
    cli_agent,
    dashboard,
    full_ia,
    knowledge,
    mcp,
    prompts,
    providers,
    reports,
    sandbox,
    scheduler,
    scans,
    settings as settings_router,
    targets,
    terminal,
    vuln_lab,
    vulnerabilities,
)
from backend.system.auth import api as auth
from backend.system.users import api as users
from backend.system.rbac import permissions_api as permissions
from backend.system.rbac import rbac_api as rbac
from backend.system.system import api as system


@dataclass(frozen=True)
class RouterSpec:
    router: object
    prefix: str | None
    tags: list[str]


SYSTEM_ROUTERS = [
    RouterSpec(auth.router, "/api/v1/auth", ["Authentication"]),
    RouterSpec(users.router, "/api/v1/users", ["User Management"]),
    RouterSpec(permissions.router, "/api/v1/permissions", ["Permissions"]),
    RouterSpec(system.router, "/api/v1/system", ["System Management"]),
    RouterSpec(rbac.router, "/api/v1/rbac", ["RBAC"]),
]

PENTEST_ROUTERS = [
    RouterSpec(scans.router, "/api/v1/scans", ["Scans"]),
    RouterSpec(targets.router, "/api/v1/targets", ["Targets"]),
    RouterSpec(prompts.router, "/api/v1/prompts", ["Prompts"]),
    RouterSpec(reports.router, "/api/v1/reports", ["Reports"]),
    RouterSpec(dashboard.router, "/api/v1/dashboard", ["Dashboard"]),
    RouterSpec(vulnerabilities.router, "/api/v1/vulnerabilities", ["Vulnerabilities"]),
    RouterSpec(settings_router.router, "/api/v1/settings", ["Settings"]),
    RouterSpec(agent.router, "/api/v1/agent", ["AI Agent"]),
    RouterSpec(agent_tasks.router, "/api/v1/agent-tasks", ["Agent Tasks"]),
    RouterSpec(scheduler.router, "/api/v1/scheduler", ["Scheduler"]),
    RouterSpec(vuln_lab.router, "/api/v1/vuln-lab", ["Vulnerability Lab"]),
    RouterSpec(terminal.router, "/api/v1/terminal", ["Terminal Agent"]),
    RouterSpec(sandbox.router, "/api/v1/sandbox", ["Sandbox"]),
    RouterSpec(knowledge.router, "/api/v1/knowledge", ["Knowledge"]),
    RouterSpec(mcp.router, "/api/v1/mcp", ["MCP Servers"]),
    RouterSpec(providers.router, "/api/v1/providers", ["Providers"]),
    RouterSpec(full_ia.router, "/api/v1/full-ia", ["FULL AI Testing"]),
    RouterSpec(cli_agent.router, None, ["CLI Agent"]),
]


def register_v1_routers(app: FastAPI) -> None:
    for spec in [*PENTEST_ROUTERS, *SYSTEM_ROUTERS]:
        if spec.prefix:
            app.include_router(spec.router, prefix=spec.prefix, tags=spec.tags)
        else:
            app.include_router(spec.router, tags=spec.tags)
