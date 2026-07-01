"""
Automatic tenant query filtering for SQLAlchemy 2.0 ORM.

Uses the ``do_orm_execute`` session event together with
``with_loader_criteria`` so that *every* ORM SELECT against a tenant-scoped
entity — including relationship / lazy loads — is transparently filtered by
the current request's ``tenant_id``. Application code (the ~21 existing
``Model.user_id == current_user.id`` call sites) needs no changes.

Platform super-admins (context.is_platform_admin) and contexts without a
tenant are not filtered. Writes are handled by ``TenantAwareMixin``.
"""
from __future__ import annotations

from sqlalchemy import event, text
from sqlalchemy.orm import Session, with_loader_criteria

from backend.common.infra.tenant_context import get_tenant_context

# Tables that carry a tenant_id and must be isolated per tenant.
TENANT_SCOPED_TABLES: set[str] = {
    "apptest_tasks",
    "scans",
    "targets",
    "reports",
    "endpoints",
    "vulnerabilities",
    "agent_tasks",
    "vulnerability_tests",
    "vuln_lab_challenges",
    "departments",
}

_MARKER = "_pttech_skip_tenant_filter"


def _is_tenant_scoped(entity) -> bool:
    mapper = getattr(entity, "__mapper__", None) or getattr(entity, "mapper", None)
    cls = getattr(mapper, "class_", None) if mapper else None
    if cls is None:
        return False
    table_name = getattr(cls, "__tablename__", None)
    return table_name in TENANT_SCOPED_TABLES and hasattr(cls, "tenant_id")


@event.listens_for(Session, "do_orm_execute")
def _apply_tenant_filter(orm_execute_state) -> None:
    """Inject tenant_id criteria into every tenant-scoped ORM SELECT."""
    if not orm_execute_state.is_select:
        return
    # Allow explicit opt-out (e.g. admin backfill, migrations run via ORM).
    if orm_execute_state.execution_options.get(_MARKER):
        return

    ctx = get_tenant_context()
    if ctx is None or ctx.is_platform_admin or ctx.tenant_id is None:
        return

    tenant_id = ctx.tenant_id

    # Apply a loader criteria per tenant-scoped entity present in the query.
    for entity in _tenant_entities(orm_execute_state):
        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(
                entity,
                lambda cls: cls.tenant_id == tenant_id,
                include_aliases=True,
            )
        )


def _tenant_entities(orm_execute_state):
    """Yield distinct tenant-scoped mapped classes referenced by the statement."""
    seen = set()
    bind_mapper = orm_execute_state.bind_mapper
    if bind_mapper is not None and _is_tenant_scoped(bind_mapper):
        cls = bind_mapper.class_
        if cls not in seen:
            seen.add(cls)
            yield cls
    # all_mappers covers joins / relationship targets in the statement
    for mapper in getattr(orm_execute_state, "all_mappers", []) or []:
        if _is_tenant_scoped(mapper):
            cls = mapper.class_
            if cls not in seen:
                seen.add(cls)
                yield cls


def setup_tenant_query_listener() -> None:
    """Idempotent hook — importing this module already registers the listener.

    Provided so callers can express intent explicitly from main.py.
    """
    return None


async def set_db_tenant_guc(db) -> None:
    """Set the PostgreSQL session variable used by RLS policies.

    RLS policies compare ``tenant_id`` against
    ``current_setting('app.current_tenant_id', true)``. When the setting is
    empty/unset (platform admin, background tasks) the policies allow all rows,
    so this is safe to call unconditionally.
    """
    ctx = get_tenant_context()
    tenant_id = ctx.tenant_id if ctx and not ctx.is_platform_admin else None
    # set_config(setting, value, is_local=true) => transaction-scoped.
    await db.execute(
        text("SELECT set_config('app.current_tenant_id', :tid, true)"),
        {"tid": tenant_id or ""},
    )


def apply_data_scope(query, model, ctx):
    """Optionally narrow a query by the user's data_scope (self/department).

    Tenant isolation is already applied automatically by the event listener.
    This helper layers *intra-tenant* visibility on top and must be called
    explicitly by endpoints that want finer control::

        query = apply_data_scope(select(Scan), Scan, get_tenant_context())

    - platform admin / tenant admin: no additional restriction
    - data_scope == "tenant": no additional restriction
    - data_scope == "self": only rows the user owns (created_by / user_id)
    - data_scope == "department": rows belonging to the user's department
      (requires the model to carry a department_id column)
    """
    if ctx is None or ctx.is_platform_admin or ctx.is_tenant_admin:
        return query
    scope = ctx.data_scope or "self"
    if scope == "tenant":
        return query
    if scope == "self":
        for col in ("created_by", "user_id"):
            if hasattr(model, col):
                return query.where(getattr(model, col) == ctx.user_id)
        return query
    if scope == "department" and ctx.department_id and hasattr(model, "department_id"):
        return query.where(model.department_id == ctx.department_id)
    return query
