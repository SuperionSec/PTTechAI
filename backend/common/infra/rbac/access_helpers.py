from backend.common.models.permission import RolePermission
from backend.common.models.user import User

# Platform-level roles may only be granted by a platform super-admin. Tenant
# admins are restricted to assigning tenant-level roles within their own tenant.
PLATFORM_ROLES = {"admin", "service"}
TENANT_ROLES = {"tenant_admin", "user", "viewer"}


def role_name_for(user: User) -> str | None:
    if user is None:
        return None
    return user.role


def is_admin_role(user: User) -> bool:
    return role_name_for(user) == "admin"


def is_service_role(user: User) -> bool:
    return role_name_for(user) == "service"


def is_tenant_admin_role(user: User) -> bool:
    return role_name_for(user) == "tenant_admin"


def is_platform_admin(user: User) -> bool:
    """Platform super-admin: cross-tenant visibility.

    An ``admin`` role with no tenant assignment is a platform-level user.
    An ``admin`` scoped to a specific tenant behaves as a tenant admin.
    """
    return is_admin_role(user) and getattr(user, "tenant_id", None) is None


def role_permission_filter(user: User):
    return RolePermission.role_id == user.role_id


def can_assign_role(actor: User, target_role_name: str | None) -> bool:
    """Whether ``actor`` is allowed to grant ``target_role_name`` to a user.

    Platform super-admins may grant any role. Everyone else (incl. tenant
    admins) may only grant tenant-level roles — never platform roles
    (admin/service) — preventing privilege escalation.
    """
    if target_role_name is None:
        return True
    if is_platform_admin(actor):
        return True
    return target_role_name in TENANT_ROLES


def restrict_to_own_records(user: User) -> bool:
    """Whether intra-tenant queries should be narrowed to the user's own rows.

    Cross-tenant isolation is applied automatically by the ORM tenant filter;
    this governs visibility *within* a tenant:

    - platform admin: False (sees everything, all tenants)
    - tenant admin: False (sees the whole tenant)
    - data_scope == "tenant": False (sees the whole tenant)
    - otherwise (data_scope self/department): True (own records only)

    NOTE: department-level scoping is not expressed here (these call sites
    filter by user_id); it is layered separately via apply_data_scope where
    needed. Defaulting the remaining cases to own-records preserves the
    pre-tenant behaviour for standard users.
    """
    if is_platform_admin(user):
        return False
    if is_tenant_admin_role(user):
        return False
    if getattr(user, "data_scope", "self") == "tenant":
        return False
    return True

