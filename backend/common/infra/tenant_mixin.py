"""
Tenant-aware mixin: automatically populates ``tenant_id`` on insert for
tenant-scoped ORM entities by reading the current request's tenant context.
"""
from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session

from backend.common.infra.tenant_context import get_tenant_context
from backend.common.infra.tenant_query import TENANT_SCOPED_TABLES


@event.listens_for(Session, "before_flush")
def _populate_tenant_id_on_new_objects(session, flush_context, instances) -> None:
    """Before each flush, set tenant_id on newly inserted tenant-scoped rows."""
    ctx = get_tenant_context()
    if ctx is None or ctx.tenant_id is None:
        return
    tenant_id = ctx.tenant_id

    for obj in session.new:
        table_name = getattr(obj, "__tablename__", None)
        if table_name in TENANT_SCOPED_TABLES:
            if hasattr(obj, "tenant_id") and getattr(obj, "tenant_id", None) is None:
                obj.tenant_id = tenant_id