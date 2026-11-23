"""Comunidade "social contido" (decisão N39)

- ``discussion.accepted_comment_id``: resposta útil das perguntas (sem FK, o
  service limpa ao apagar o comentário);
- ``community_profile``: perfil opcional da página Pessoas, desligado por
  padrão, um por pessoa e org;
- ``user_follow``: seguir pessoas (sem efeito de acesso);
- ``community_notification``: notificações simples no app (menções);
- ``discussioncommentreaction``: "Amém" e "Orando" em comentários (nos posts,
  as reações usam a ``discussionreaction`` que já existia).

Idempotente: se o ``create_all`` já criou tabelas, colunas ou índices, só o
que falta é criado. O downgrade remove tudo que esta migração cria.

Revision ID: dd4e5f6a7b8c
Revises: cc3d4e5f6a7b
Create Date: 2026-11-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'dd4e5f6a7b8c'
down_revision: Union[str, None] = 'cc3d4e5f6a7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TABLES = ('discussioncommentreaction', 'community_notification', 'user_follow', 'community_profile')

_INDEXES = {
    'community_profile': (
        ('ix_community_profile_org_visible', ['org_id', 'visible'], False),
    ),
    'user_follow': (
        ('ix_user_follow_followed', ['followed_id', 'org_id'], False),
    ),
    'community_notification': (
        ('ix_community_notification_user', ['user_id', 'org_id', 'read_at'], False),
        ('ix_community_notification_notification_uuid', ['notification_uuid'], False),
    ),
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if 'discussion' in tables:
        cols = {c['name'] for c in inspector.get_columns('discussion')}
        if 'accepted_comment_id' not in cols:
            op.add_column('discussion', sa.Column('accepted_comment_id', sa.Integer(), nullable=True))

    if 'community_profile' not in tables:
        op.create_table(
            'community_profile',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('visible', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('bio', sa.String(280), nullable=False, server_default=''),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('user_id', 'org_id', name='uq_community_profile_user_org'),
        )

    if 'user_follow' not in tables:
        op.create_table(
            'user_follow',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('follower_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('followed_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('follower_id', 'followed_id', 'org_id', name='uq_user_follow'),
        )

    if 'community_notification' not in tables:
        op.create_table(
            'community_notification',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('notification_uuid', sa.String(), nullable=False, server_default=''),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('actor_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('kind', sa.String(20), nullable=False),
            sa.Column('discussion_id', sa.Integer(), sa.ForeignKey('discussion.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('comment_id', sa.Integer(), sa.ForeignKey('discussioncomment.id', ondelete='CASCADE'),
                      nullable=True),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('read_at', sa.String(40), nullable=True),
        )

    if 'discussioncommentreaction' not in tables:
        op.create_table(
            'discussioncommentreaction',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('comment_id', sa.Integer(), sa.ForeignKey('discussioncomment.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('kind', sa.String(20), nullable=False),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('comment_id', 'user_id', 'kind', name='uq_comment_reaction'),
        )

    inspector = sa.inspect(bind)
    for table, indexes in _INDEXES.items():
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, cols, unique in indexes:
            if name not in existing:
                op.create_index(name, table, cols, unique=unique)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table in _NEW_TABLES:
        if table not in tables:
            continue
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, _cols, _unique in _INDEXES.get(table, ()):
            if name in existing:
                op.drop_index(name, table_name=table)
        op.drop_table(table)

    if 'discussion' in tables:
        cols = {c['name'] for c in inspector.get_columns('discussion')}
        if 'accepted_comment_id' in cols:
            with op.batch_alter_table('discussion') as batch:
                batch.drop_column('accepted_comment_id')
