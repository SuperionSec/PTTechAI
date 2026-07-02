"""add user profile fields (phone/avatar/remark/pwd_update_date)

Revision ID: 20260701_0004
Revises: 20260701_0003
Create Date: 2026-07-01
"""
from typing import Sequence, Union

from alembic import context, op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "20260701_0004"
down_revision: Union[str, Sequence[str], None] = "20260701_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = {
    "phone": sa.String(length=32),
    "avatar": sa.String(length=512),
    "remark": sa.String(length=500),
    "pwd_update_date": sa.DateTime(),
}


def _column_exists(table: str, column: str) -> bool:
    if context.is_offline_mode():
        return False
    bind = op.get_bind()
    if not inspect(bind).has_table(table):
        return False
    return column in {c["name"] for c in inspect(bind).get_columns(table)}


def upgrade() -> None:
    for name, col_type in COLUMNS.items():
        if not _column_exists("users", name):
            op.add_column("users", sa.Column(name, col_type, nullable=True))


def downgrade() -> None:
    for name in COLUMNS:
        if _column_exists("users", name):
            op.drop_column("users", name)
