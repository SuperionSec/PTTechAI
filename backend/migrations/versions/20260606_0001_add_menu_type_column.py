"""add menu_type column to menus table

Revision ID: 20260606_0001
Revises: 20260605_0002
Create Date: 2026-06-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260606_0001"
down_revision: Union[str, Sequence[str], None] = "20260605_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "menus",
        sa.Column(
            "menu_type",
            sa.String(20),
            nullable=False,
            server_default="menu",
            comment="directory/menu/button",
        ),
    )
    # Set parent menus (no path, has children) as directory type
    op.execute("UPDATE menus SET menu_type = 'directory' WHERE path IS NULL AND parent_id IS NULL")


def downgrade() -> None:
    op.drop_column("menus", "menu_type")
