"""
Tenant Context - request-scoped multi-tenant isolation context.

The context is populated during authentication (``get_current_user`` /
API-key auth) and consumed by the automatic query filter in
``tenant_query.py``. When no context is set (public routes, background tasks,
platform super-admin) tenant filtering is skipped.
"""
from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class TenantContextData:
    """Immutable per-request tenant/data-scope context."""
    user_id: str
    tenant_id: Optional[str] = None          # None => platform-level user (super admin)
    department_id: Optional[str] = None
    data_scope: str = "self"                  # self / department / tenant
    is_platform_admin: bool = False           # cross-tenant visibility
    is_tenant_admin: bool = False             # full visibility within own tenant


_tenant_context: ContextVar[Optional[TenantContextData]] = ContextVar(
    "tenant_context", default=None
)


def get_tenant_context() -> Optional[TenantContextData]:
    """Return the current request's tenant context, or None if unset."""
    return _tenant_context.get()


def set_tenant_context(data: TenantContextData) -> Token:
    """Set the tenant context for the current async context. Returns a reset token."""
    return _tenant_context.set(data)


def reset_tenant_context(token: Optional[Token] = None) -> None:
    """Reset the tenant context. Pass the token from set_tenant_context, or clear."""
    if token is not None:
        _tenant_context.reset(token)
    else:
        _tenant_context.set(None)


def tenant_filtering_active() -> bool:
    """True when a tenant-scoped (non-platform-admin) context is present."""
    ctx = _tenant_context.get()
    return ctx is not None and not ctx.is_platform_admin and ctx.tenant_id is not None
