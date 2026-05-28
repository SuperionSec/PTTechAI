"""add roles table and role foreign keys

Revision ID: 20260526_0001
Revises:
Create Date: 2026-05-26
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision: str = "20260526_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_ROLES = [
    ("00000000-0000-0000-0000-000000000001", "admin", "Administrator", "Full system administrator"),
    ("00000000-0000-0000-0000-000000000002", "user", "Standard User", "Standard authenticated user"),
    ("00000000-0000-0000-0000-000000000003", "viewer", "Viewer", "Read-only user"),
    ("00000000-0000-0000-0000-000000000004", "service", "Service Account", "API-only service account"),
]


def _table_exists(table_name: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    return inspect(bind).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table_name):
        return False
    return column_name in {column["name"] for column in inspect(bind).get_columns(table_name)}


def _fk_exists(table_name: str, fk_name: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table_name):
        return False
    return fk_name in {fk["name"] for fk in inspect(bind).get_foreign_keys(table_name)}


def upgrade() -> None:
    if not _table_exists("roles"):
        op.create_table(
            "roles",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("name", sa.String(length=50), nullable=False),
            sa.Column("display_name", sa.String(length=100), nullable=False),
            sa.Column("description", sa.String(length=255), nullable=True),
            sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", name="uq_roles_name"),
        )

    if not _column_exists("users", "role_id"):
        op.add_column("users", sa.Column("role_id", sa.String(length=36), nullable=True))
    if not _fk_exists("users", "fk_users_role_id_roles"):
        op.create_foreign_key("fk_users_role_id_roles", "users", "roles", ["role_id"], ["id"])

    if not _column_exists("role_permissions", "role_id"):
        op.add_column("role_permissions", sa.Column("role_id", sa.String(length=36), nullable=True))
    if not _fk_exists("role_permissions", "fk_role_permissions_role_id_roles"):
        op.create_foreign_key("fk_role_permissions_role_id_roles", "role_permissions", "roles", ["role_id"], ["id"])

    for role_id, role_name, display_name, description in DEFAULT_ROLES:
        op.execute(
            text(
                """
                INSERT INTO roles (id, name, display_name, description, is_system, is_active, created_at, updated_at)
                VALUES (:role_id, :role_name, :display_name, :description, false, true, now(), now())
                ON CONFLICT (name) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    is_system = false,
                    is_active = true,
                    updated_at = now()
                """
            ).bindparams(
                role_id=role_id,
                role_name=role_name,
                display_name=display_name,
                description=description,
            )
        )

    op.execute(
        text(
            """
            UPDATE users
            SET role_id = roles.id
            FROM roles
            WHERE users.role_id IS NULL AND users.role = roles.name
            """
        )
    )
    op.execute(
        text(
            """
            UPDATE role_permissions
            SET role_id = roles.id
            FROM roles
            WHERE role_permissions.role_id IS NULL AND role_permissions.role = roles.name
            """
        )
    )


def downgrade() -> None:
    if _fk_exists("role_permissions", "fk_role_permissions_role_id_roles"):
        op.drop_constraint("fk_role_permissions_role_id_roles", "role_permissions", type_="foreignkey")
    if _column_exists("role_permissions", "role_id"):
        op.drop_column("role_permissions", "role_id")

    if _fk_exists("users", "fk_users_role_id_roles"):
        op.drop_constraint("fk_users_role_id_roles", "users", type_="foreignkey")
    if _column_exists("users", "role_id"):
        op.drop_column("users", "role_id")

    if _table_exists("roles"):
        op.drop_table("roles")
