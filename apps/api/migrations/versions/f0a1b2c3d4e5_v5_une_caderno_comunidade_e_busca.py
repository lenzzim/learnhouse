"""v5 une caderno comunidade e busca

Revision ID: f0a1b2c3d4e5
Revises: e1b7c3d9a2f4, e2a1b3c5d7f9, e3a4b5c6d7e8
Create Date: 2026-11-24 02:20:35.312086

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa # noqa: F401
import sqlmodel # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'f0a1b2c3d4e5'
down_revision: Union[str, None] = ('e1b7c3d9a2f4', 'e2a1b3c5d7f9', 'e3a4b5c6d7e8')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
