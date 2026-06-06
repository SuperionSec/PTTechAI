"""enhance vuln library entries with vuln_type epss and cvss sub-fields

Revision ID: 20260605_0001
Revises: 20260603_0002
Create Date: 2026-06-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260605_0001"
down_revision: Union[str, Sequence[str], None] = "20260603_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("vuln_library_entries", sa.Column("vuln_type", sa.String(100), nullable=True))
    op.add_column("vuln_library_entries", sa.Column("epss_score", sa.Float(), nullable=True))
    op.add_column("vuln_library_entries", sa.Column("epss_percentile", sa.Float(), nullable=True))
    op.add_column("vuln_library_entries", sa.Column("attack_complexity", sa.String(20), nullable=True))
    op.add_column("vuln_library_entries", sa.Column("privileges_required", sa.String(20), nullable=True))
    op.add_column("vuln_library_entries", sa.Column("user_interaction", sa.String(20), nullable=True))
    op.create_index("ix_vuln_library_entries_vuln_type", "vuln_library_entries", ["vuln_type"])


def downgrade() -> None:
    op.drop_index("ix_vuln_library_entries_vuln_type", table_name="vuln_library_entries")
    op.drop_column("vuln_library_entries", "user_interaction")
    op.drop_column("vuln_library_entries", "privileges_required")
    op.drop_column("vuln_library_entries", "attack_complexity")
    op.drop_column("vuln_library_entries", "epss_percentile")
    op.drop_column("vuln_library_entries", "epss_score")
    op.drop_column("vuln_library_entries", "vuln_type")
