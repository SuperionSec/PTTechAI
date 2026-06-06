"""fix rbac system roles and vuln_library read_exp action

Revision ID: 20260605_0002
Revises: 20260605_0001
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260605_0002"
down_revision: Union[str, Sequence[str], None] = "20260605_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mark built-in roles as system roles so they cannot be deleted
    op.execute(
        "UPDATE roles SET is_system = TRUE WHERE name IN ('admin', 'user', 'viewer', 'service')"
    )
    # Fix vuln_library:read_exp action to EXECUTE for scope+action uniqueness
    op.execute(
        "UPDATE permissions SET action = 'execute' WHERE name = 'vuln_library:read_exp'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE roles SET is_system = FALSE WHERE name IN ('admin', 'user', 'viewer', 'service')"
    )
    op.execute(
        "UPDATE permissions SET action = 'read' WHERE name = 'vuln_library:read_exp'"
    )
