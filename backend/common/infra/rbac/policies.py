import os
from enum import Enum


class UnmappedApiPolicy(str, Enum):
    ALLOW = "allow"
    WARN = "warn"
    DENY = "deny"


def get_unmapped_api_policy() -> UnmappedApiPolicy:
    value = os.getenv("RBAC_UNMAPPED_API_POLICY", "allow").lower()
    if value not in {policy.value for policy in UnmappedApiPolicy}:
        return UnmappedApiPolicy.ALLOW
    return UnmappedApiPolicy(value)


def should_reset_role_permissions_on_startup() -> bool:
    return os.getenv("RBAC_RESET_ON_STARTUP", "false").lower() in {"1", "true", "yes", "on"}
