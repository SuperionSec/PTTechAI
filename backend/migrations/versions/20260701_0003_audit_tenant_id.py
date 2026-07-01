"""add tenant_id to audit_logs for tenant-scoped audit trails

Revision ID: 20260701_0003
Revises: 20260701_0002
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "20260701_0003"
down_revision: Union[str, Sequence[str], None] = "20260701_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    # Add the AUDIT value to the permissionscope enum (native PG enum).
    if not context.is_offline_mode() and op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE permissionscope ADD VALUE IF NOT EXISTS 'AUDIT'")

    if not _column_exists("audit_logs", "tenant_id"):
        op.add_column("audit_logs", sa.Column("tenant_id", sa.String(length=36), nullable=True))
        op.create_index("ix_audit_logs_tenant_id", "audit_logs", ["tenant_id"])
    # Backfill historical rows from the acting user's tenant.
    if not context.is_offline_mode():
        op.execute(
            text(
                """
                UPDATE audit_logs a
                SET tenant_id = u.tenant_id
                FROM users u
                WHERE a.user_id = u.id
                  AND a.tenant_id IS NULL
                  AND u.tenant_id IS NOT NULL
                """
            )
        )


def downgrade() -> None:
    if _column_exists("audit_logs", "tenant_id"):
        try:
            op.drop_index("ix_audit_logs_tenant_id", table_name="audit_logs")
        except Exception:
            pass
        op.drop_column("audit_logs", "tenant_id")
