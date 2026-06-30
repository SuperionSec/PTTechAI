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
from backend.system.system import api as system
from backend.system.menu import api as menu
from backend.system.audit import api as audit
from backend.system.monitor import api as monitor
from backend.vulnerability_library import api as vuln_library
from backend.apptest import api as apptest


@dataclass(frozen=True)
class RouterSpec:
    router: object
    prefix: str | None
    tags: list[str]


SYSTEM_ROUTERS = [
    RouterSpec(system.router, "/api/v1/system", ["System Management"]),
    RouterSpec(menu.router, "/api/v1/menus", ["Menu Management"]),
    RouterSpec(audit.router, "/api/v1/audit", ["Audit Logs"]),
    RouterSpec(monitor.router, "/api/v1/monitor", ["System Monitor"]),
]


VULNERABILITY_LIBRARY_ROUTERS = [
    RouterSpec(vuln_library.router, "/api/v1/vulnerability-library", ["Vulnerability Library"]),
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
    RouterSpec(apptest.router, "/api/v1/apptest", ["App Test"]),
]


def register_v1_routers(app: FastAPI) -> None:
    for spec in [*PENTEST_ROUTERS, *VULNERABILITY_LIBRARY_ROUTERS, *SYSTEM_ROUTERS]:
        if spec.prefix:
            app.include_router(spec.router, prefix=spec.prefix, tags=spec.tags)
        else:
            app.include_router(spec.router, tags=spec.tags)
