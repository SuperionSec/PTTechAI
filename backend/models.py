"""Central model registry for metadata discovery and background tasks."""
from backend.pentest.backend.models import (  # noqa: F401
    AgentTask,
    Endpoint,
    Prompt,
    Report,
    Scan,
    Target,
    Vulnerability,
    VulnerabilityTest,
    VulnLabChallenge,
)
from backend.common.models.permission import Permission, PermissionAction, PermissionScope, ResourceMapping, RolePermission  # noqa: F401
from backend.common.models.user import APIKey, Role, RoleModel, User  # noqa: F401
from backend.system.audit.models import AuditLog  # noqa: F401
from backend.system.menu.models import Menu  # noqa: F401
from backend.system.organization.models import Department, Tenant  # noqa: F401
from backend.vulnerability_library.models import (  # noqa: F401
    VulnLibraryArtifact,
    VulnLibraryCategory,
    VulnLibraryEntry,
    VulnLibraryIdentifier,
)
from backend.apptest.models import AppTestTask  # noqa: F401

__all__ = [
    "AgentTask",
    "Endpoint",
    "Prompt",
    "Report",
    "Scan",
    "Target",
    "Vulnerability",
    "VulnerabilityTest",
    "VulnLabChallenge",
    "Permission",
    "PermissionAction",
    "PermissionScope",
    "ResourceMapping",
    "RolePermission",
    "APIKey",
    "Role",
    "RoleModel",
    "User",
    "AuditLog",
    "Menu",
    "Tenant",
    "Department",
    "VulnLibraryArtifact",
    "VulnLibraryCategory",
    "VulnLibraryEntry",
    "VulnLibraryIdentifier",
    "AppTestTask",
]
