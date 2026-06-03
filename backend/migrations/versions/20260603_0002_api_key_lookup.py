"""add api key lookup columns

Revision ID: 20260603_0002
Revises: 20260603_0001
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260603_0002"
down_revision: Union[str, Sequence[str], None] = "20260603_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("key_prefix", sa.String(length=16), nullable=True))
    op.add_column("api_keys", sa.Column("key_digest", sa.String(length=64), nullable=True))
    op.create_index(op.f("ix_api_keys_key_prefix"), "api_keys", ["key_prefix"], unique=False)
    op.create_index("uq_api_keys_key_digest_not_null", "api_keys", ["key_digest"], unique=True, postgresql_where=sa.text("key_digest IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_api_keys_key_digest_not_null", table_name="api_keys")
    op.drop_index(op.f("ix_api_keys_key_prefix"), table_name="api_keys")
    op.drop_column("api_keys", "key_digest")
    op.drop_column("api_keys", "key_prefix")
