"""migrate rbac to role_id only

Revision ID: 20260603_0001
Revises: 20260602_0001
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260603_0001"
down_revision: Union[str, Sequence[str], None] = "20260602_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (id, name, display_name, description, is_system, is_active, created_at, updated_at)
        SELECT md5(role_name || clock_timestamp()::text || random()::text), role_name, initcap(role_name), NULL, false, true, now(), now()
        FROM (
            SELECT DISTINCT role AS role_name FROM users WHERE role IS NOT NULL
            UNION
            SELECT DISTINCT role AS role_name FROM role_permissions WHERE role IS NOT NULL
            UNION
            SELECT 'admin'
            UNION
            SELECT 'user'
            UNION
            SELECT 'viewer'
            UNION
            SELECT 'service'
        ) names
        WHERE role_name IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM roles WHERE roles.name = names.role_name);
        """
    )
    op.execute(
        """
        UPDATE users
        SET role_id = roles.id
        FROM roles
        WHERE users.role_id IS NULL
          AND users.role = roles.name;
        """
    )
    op.execute(
        """
        UPDATE role_permissions
        SET role_id = roles.id
        FROM roles
        WHERE role_permissions.role_id IS NULL
          AND role_permissions.role = roles.name;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM users WHERE role_id IS NULL) THEN
                RAISE EXCEPTION 'Cannot migrate users to role_id-only: unresolved user role_id rows remain';
            END IF;
            IF EXISTS (SELECT 1 FROM role_permissions WHERE role_id IS NULL) THEN
                RAISE EXCEPTION 'Cannot migrate role_permissions to role_id-only: unresolved role_id rows remain';
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        DELETE FROM role_permissions a
        USING role_permissions b
        WHERE a.id > b.id
          AND a.role_id = b.role_id
          AND a.permission_id = b.permission_id;
        """
    )
    op.alter_column("users", "role_id", existing_type=sa.String(length=36), nullable=False)
    op.alter_column("role_permissions", "role_id", existing_type=sa.String(length=36), nullable=False)
    op.create_unique_constraint("uq_role_permissions_role_id_permission_id", "role_permissions", ["role_id", "permission_id"])
    op.drop_index("ix_role_permissions_role", table_name="role_permissions")
    op.drop_column("role_permissions", "role")
    op.drop_column("users", "role")


def downgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(length=50), nullable=True))
    op.add_column("role_permissions", sa.Column("role", sa.String(length=50), nullable=True))
    op.execute("UPDATE users SET role = roles.name FROM roles WHERE users.role_id = roles.id")
    op.execute("UPDATE role_permissions SET role = roles.name FROM roles WHERE role_permissions.role_id = roles.id")
    op.alter_column("users", "role", nullable=False)
    op.alter_column("role_permissions", "role", nullable=False)
    op.drop_constraint("uq_role_permissions_role_id_permission_id", "role_permissions", type_="unique")
    op.create_index("ix_role_permissions_role", "role_permissions", ["role"], unique=False)
    op.alter_column("users", "role_id", existing_type=sa.String(length=36), nullable=True)
    op.alter_column("role_permissions", "role_id", existing_type=sa.String(length=36), nullable=True)
