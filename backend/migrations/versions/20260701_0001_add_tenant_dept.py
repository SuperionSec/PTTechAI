"""add multi-tenant organization: tenants, departments, user + business tenant_id

Revision ID: 20260701_0001
Revises: 20260606_0001
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "20260701_0001"
down_revision: Union[str, Sequence[str], None] = "20260606_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_TENANT_ID = "00000000-0000-0000-0000-0000000000t0"
DEFAULT_DEPT_ID = "00000000-0000-0000-0000-0000000000d0"

# Business tables that gain a tenant_id, mapped to their owner column.
BUSINESS_TABLES = {
    "apptest_tasks": "created_by",
    "scans": "user_id",
    "targets": "user_id",
    "reports": "user_id",
    "endpoints": "user_id",
    "vulnerabilities": "user_id",
    "agent_tasks": "user_id",
    "vulnerability_tests": "user_id",
    "vuln_lab_challenges": "user_id",
}


def _table_exists(name: str) -> bool:
    if context.is_offline_mode():
        return False
    return inspect(op.get_bind()).has_table(name)


def _column_exists(table: str, column: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def _fk_exists(table: str, fk_name: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table):
        return False
    return fk_name in {fk["name"] for fk in inspect(bind).get_foreign_keys(table)}


def upgrade() -> None:
    # ── 1. tenants ──
    if not _table_exists("tenants"):
        op.create_table(
            "tenants",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("code", sa.String(length=50), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("logo_url", sa.String(length=255), nullable=True),
            sa.Column("contact_email", sa.String(length=255), nullable=True),
            sa.Column("contact_phone", sa.String(length=50), nullable=True),
            sa.Column("max_users", sa.Integer(), nullable=True),
            sa.Column("max_storage_gb", sa.Integer(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_tenants_code"),
        )
        op.create_index("ix_tenants_code", "tenants", ["code"])

    # ── 2. departments ──
    if not _table_exists("departments"):
        op.create_table(
            "departments",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("tenant_id", sa.String(length=36), nullable=False),
            sa.Column("parent_id", sa.String(length=36), nullable=True),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("description", sa.String(length=255), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], name="fk_departments_tenant", ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["parent_id"], ["departments.id"], name="fk_departments_parent", ondelete="CASCADE"),
            sa.UniqueConstraint("tenant_id", "name", "parent_id", name="uq_dept_name_per_parent"),
        )
        op.create_index("ix_departments_tenant_id", "departments", ["tenant_id"])
        op.create_index("ix_departments_parent_id", "departments", ["parent_id"])

    # ── 3. seed default tenant + root department ──
    op.execute(
        text(
            """
            INSERT INTO tenants (id, code, name, status, is_active, created_at, updated_at)
            VALUES (:tid, 'default', 'Default Tenant', 'active', true, now(), now())
            ON CONFLICT (code) DO NOTHING
            """
        ).bindparams(tid=DEFAULT_TENANT_ID)
    )
    op.execute(
        text(
            """
            INSERT INTO departments (id, tenant_id, parent_id, name, sort_order, is_active, created_at, updated_at)
            VALUES (:did, :tid, NULL, 'Default Department', 0, true, now(), now())
            ON CONFLICT DO NOTHING
            """
        ).bindparams(did=DEFAULT_DEPT_ID, tid=DEFAULT_TENANT_ID)
    )

    # ── 4. users: tenant_id / department_id / data_scope ──
    if not _column_exists("users", "tenant_id"):
        op.add_column("users", sa.Column("tenant_id", sa.String(length=36), nullable=True))
        op.create_index("ix_users_tenant_id", "users", ["tenant_id"])
    if not _fk_exists("users", "fk_users_tenant_id"):
        op.create_foreign_key("fk_users_tenant_id", "users", "tenants", ["tenant_id"], ["id"])
    if not _column_exists("users", "department_id"):
        op.add_column("users", sa.Column("department_id", sa.String(length=36), nullable=True))
    if not _fk_exists("users", "fk_users_department_id"):
        op.create_foreign_key("fk_users_department_id", "users", "departments", ["department_id"], ["id"])
    if not _column_exists("users", "data_scope"):
        op.add_column("users", sa.Column("data_scope", sa.String(length=20), nullable=False, server_default="self"))

    # Backfill: assign all existing non-admin users to the default tenant.
    # Platform admins (role 'admin' / 'service') stay tenant-less for cross-tenant access.
    op.execute(
        text(
            """
            UPDATE users u
            SET tenant_id = :tid, department_id = :did
            FROM roles r
            WHERE u.role_id = r.id
              AND u.tenant_id IS NULL
              AND r.name NOT IN ('admin', 'service')
            """
        ).bindparams(tid=DEFAULT_TENANT_ID, did=DEFAULT_DEPT_ID)
    )

    # ── 5. business tables: add tenant_id + backfill from owner → user.tenant_id ──
    for table, owner_col in BUSINESS_TABLES.items():
        if not _table_exists(table):
            continue
        if not _column_exists(table, "tenant_id"):
            op.add_column(table, sa.Column("tenant_id", sa.String(length=36), nullable=True))
            op.create_index(f"ix_{table}_tenant_id", table, ["tenant_id"])
        if not _fk_exists(table, f"fk_{table}_tenant_id"):
            op.create_foreign_key(f"fk_{table}_tenant_id", table, "tenants", ["tenant_id"], ["id"])
        # Backfill from the owning user's tenant.
        if _column_exists(table, owner_col):
            op.execute(
                text(
                    f"""
                    UPDATE {table} t
                    SET tenant_id = u.tenant_id
                    FROM users u
                    WHERE t.{owner_col} = u.id
                      AND t.tenant_id IS NULL
                      AND u.tenant_id IS NOT NULL
                    """
                )
            )
        # Any rows still null (owner was a platform admin / orphan) → default tenant.
        op.execute(
            text(
                f"UPDATE {table} SET tenant_id = :tid WHERE tenant_id IS NULL"
            ).bindparams(tid=DEFAULT_TENANT_ID)
        )


def downgrade() -> None:
    # Business tables
    for table in BUSINESS_TABLES:
        if _fk_exists(table, f"fk_{table}_tenant_id"):
            op.drop_constraint(f"fk_{table}_tenant_id", table, type_="foreignkey")
        if _column_exists(table, "tenant_id"):
            try:
                op.drop_index(f"ix_{table}_tenant_id", table_name=table)
            except Exception:
                pass
            op.drop_column(table, "tenant_id")

    # users
    for fk in ("fk_users_department_id", "fk_users_tenant_id"):
        if _fk_exists("users", fk):
            op.drop_constraint(fk, "users", type_="foreignkey")
    if _column_exists("users", "data_scope"):
        op.drop_column("users", "data_scope")
    if _column_exists("users", "department_id"):
        op.drop_column("users", "department_id")
    if _column_exists("users", "tenant_id"):
        try:
            op.drop_index("ix_users_tenant_id", table_name="users")
        except Exception:
            pass
        op.drop_column("users", "tenant_id")

    # departments / tenants
    if _table_exists("departments"):
        op.drop_table("departments")
    if _table_exists("tenants"):
        op.drop_table("tenants")
