"""enable row-level security (RLS) on tenant-scoped business tables

Defense-in-depth: even if an application query forgets the tenant filter,
PostgreSQL restricts rows to the tenant in ``app.current_tenant_id``.
When the GUC is empty/unset (platform admin, background jobs, migrations)
the policy is permissive (all rows) so existing behaviour is preserved.

Revision ID: 20260701_0002
Revises: 20260701_0001
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import context, op
from sqlalchemy import inspect, text

revision: str = "20260701_0002"
down_revision: Union[str, Sequence[str], None] = "20260701_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_TABLES = [
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
]


def _table_exists(name: str) -> bool:
    if context.is_offline_mode():
        return False
    return inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    # Only meaningful on PostgreSQL.
    if bind.dialect.name != "postgresql":
        return

    for table in RLS_TABLES:
        if not _table_exists(table):
            continue
        policy = f"tenant_isolation_{table}"
        op.execute(text(f'ALTER TABLE {table} ENABLE ROW LEVEL SECURITY'))
        op.execute(text(f'ALTER TABLE {table} FORCE ROW LEVEL SECURITY'))
        op.execute(text(f'DROP POLICY IF EXISTS {policy} ON {table}'))
        # Permissive when GUC is empty/unset; otherwise restrict to tenant.
        op.execute(
            text(
                f"""
                CREATE POLICY {policy} ON {table}
                USING (
                    current_setting('app.current_tenant_id', true) IS NULL
                    OR current_setting('app.current_tenant_id', true) = ''
                    OR tenant_id = current_setting('app.current_tenant_id', true)
                )
                WITH CHECK (
                    current_setting('app.current_tenant_id', true) IS NULL
                    OR current_setting('app.current_tenant_id', true) = ''
                    OR tenant_id = current_setting('app.current_tenant_id', true)
                )
                """
            )
        )


def downgrade() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in RLS_TABLES:
        if not _table_exists(table):
            continue
        policy = f"tenant_isolation_{table}"
        op.execute(text(f'DROP POLICY IF EXISTS {policy} ON {table}'))
        op.execute(text(f'ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY'))
        op.execute(text(f'ALTER TABLE {table} DISABLE ROW LEVEL SECURITY'))
