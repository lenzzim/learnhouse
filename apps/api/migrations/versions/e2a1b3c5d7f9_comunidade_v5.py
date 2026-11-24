"""Comunidade v5: blog só para autores, WhatsApp na entrada, bate-papos,
salvos e compartilhar (decisões N42, N44 e N45)

- ``community_org_settings``: grupo de autores, grupos Homens/Mulheres (só
  para sugerir) e links do WhatsApp, um por org;
- ``community_member_pref``: escolha do grupo do WhatsApp (só a pessoa e
  admins veem);
- ``saved_discussion``: posts salvos;
- ``discussion.share_disabled``: o autor desliga o compartilhamento do post;
- ``community_event`` e ``community_event_rsvp``: Bate-papo Online;
- ``community_notification``: ``discussion_id`` passa a aceitar NULL e ganha
  ``event_id`` (lembretes), com índice único (pessoa, encontro, tipo).

As regras de cada espaço (quem pode publicar, comentários, "não
compartilhável") ficam no JSON ``community.moderation_settings``, sem coluna.

Idempotente: o que o ``create_all`` já tiver criado é pulado. O downgrade
remove tudo o que esta migração cria; as notificações de lembrete (sem
discussão) são apagadas antes de ``discussion_id`` voltar a NOT NULL.

Revision ID: e2a1b3c5d7f9
Revises: dd4e5f6a7b8c
Create Date: 2026-11-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'e2a1b3c5d7f9'
down_revision: Union[str, None] = 'dd4e5f6a7b8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NEW_TABLES = (
    'community_event_rsvp',
    'community_event',
    'saved_discussion',
    'community_member_pref',
    'community_org_settings',
)

_INDEXES = {
    'community_event': (
        ('ix_community_event_org_starts', ['org_id', 'starts_at'], False),
        ('ix_community_event_event_uuid', ['event_uuid'], False),
    ),
    'community_event_rsvp': (
        ('ix_community_event_rsvp_user', ['user_id'], False),
    ),
    'saved_discussion': (
        ('ix_saved_discussion_user_org', ['user_id', 'org_id'], False),
    ),
}

_NOTIFICATION_UNIQUE = 'uq_community_notification_event'


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if 'community_org_settings' not in tables:
        op.create_table(
            'community_org_settings',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('authors_usergroup_id', sa.Integer(), sa.ForeignKey('usergroup.id', ondelete='SET NULL'),
                      nullable=True),
            sa.Column('men_usergroup_id', sa.Integer(), sa.ForeignKey('usergroup.id', ondelete='SET NULL'),
                      nullable=True),
            sa.Column('women_usergroup_id', sa.Integer(), sa.ForeignKey('usergroup.id', ondelete='SET NULL'),
                      nullable=True),
            sa.Column('whatsapp_men_url', sa.String(300), nullable=False, server_default=''),
            sa.Column('whatsapp_women_url', sa.String(300), nullable=False, server_default=''),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('org_id', name='uq_community_org_settings_org'),
        )

    if 'community_member_pref' not in tables:
        op.create_table(
            'community_member_pref',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('whatsapp_group', sa.String(10), nullable=True),
            sa.Column('whatsapp_prompted', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('user_id', 'org_id', name='uq_community_member_pref_user_org'),
        )

    if 'saved_discussion' not in tables:
        op.create_table(
            'saved_discussion',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('discussion_id', sa.Integer(), sa.ForeignKey('discussion.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('user_id', 'discussion_id', name='uq_saved_discussion'),
        )

    if 'community_event' not in tables:
        op.create_table(
            'community_event',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('event_uuid', sa.String(), nullable=False, server_default=''),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('title', sa.String(160), nullable=False),
            sa.Column('theme', sa.String(160), nullable=False, server_default=''),
            sa.Column('description', sa.Text(), nullable=False, server_default=''),
            sa.Column('starts_at', sa.String(40), nullable=False),
            sa.Column('timezone', sa.String(64), nullable=False, server_default='America/Sao_Paulo'),
            sa.Column('duration_minutes', sa.Integer(), nullable=False, server_default='60'),
            sa.Column('meeting_url', sa.String(500), nullable=False, server_default=''),
            sa.Column('host_name', sa.String(120), nullable=False, server_default=''),
            sa.Column('passages', sa.String(300), nullable=False, server_default=''),
            sa.Column('announcement_discussion_id', sa.Integer(),
                      sa.ForeignKey('discussion.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
        )

    if 'community_event_rsvp' not in tables:
        op.create_table(
            'community_event_rsvp',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('event_id', sa.Integer(), sa.ForeignKey('community_event.id', ondelete='CASCADE'),
                      nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(10), nullable=False),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('event_id', 'user_id', name='uq_community_event_rsvp'),
        )

    if 'discussion' in tables:
        cols = {c['name'] for c in inspector.get_columns('discussion')}
        if 'share_disabled' not in cols:
            op.add_column('discussion', sa.Column('share_disabled', sa.Boolean(), nullable=False,
                                                  server_default=sa.false()))

    if 'community_notification' in tables:
        cols = {c['name']: c for c in inspector.get_columns('community_notification')}
        add_event = 'event_id' not in cols
        relax = 'discussion_id' in cols and not cols['discussion_id'].get('nullable', True)
        if add_event or relax:
            with op.batch_alter_table('community_notification') as batch:
                if add_event:
                    batch.add_column(sa.Column('event_id', sa.Integer(), nullable=True))
                    batch.create_foreign_key(
                        'fk_community_notification_event', 'community_event', ['event_id'], ['id'],
                        ondelete='CASCADE',
                    )
                if relax:
                    batch.alter_column('discussion_id', existing_type=sa.Integer(), nullable=True)

    inspector = sa.inspect(bind)
    for table, indexes in _INDEXES.items():
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, cols, unique in indexes:
            if name not in existing:
                op.create_index(name, table, cols, unique=unique)

    if 'community_notification' in set(inspector.get_table_names()):
        existing = {ix['name'] for ix in inspector.get_indexes('community_notification')}
        existing |= {uc['name'] for uc in inspector.get_unique_constraints('community_notification')}
        if _NOTIFICATION_UNIQUE not in existing:
            op.create_index(_NOTIFICATION_UNIQUE, 'community_notification', ['user_id', 'event_id', 'kind'],
                            unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if 'community_notification' in tables:
        indexes = {ix['name'] for ix in inspector.get_indexes('community_notification')}
        uniques = {uc['name'] for uc in inspector.get_unique_constraints('community_notification')}
        if _NOTIFICATION_UNIQUE in indexes:
            op.drop_index(_NOTIFICATION_UNIQUE, table_name='community_notification')
        elif _NOTIFICATION_UNIQUE in uniques:
            with op.batch_alter_table('community_notification') as batch:
                batch.drop_constraint(_NOTIFICATION_UNIQUE, type_='unique')
        cols = {c['name'] for c in inspector.get_columns('community_notification')}
        # Lembretes não têm discussão: saem antes de discussion_id voltar a NOT NULL.
        op.execute(sa.text('DELETE FROM community_notification WHERE discussion_id IS NULL'))
        fks = {fk.get('name') for fk in inspector.get_foreign_keys('community_notification')}
        with op.batch_alter_table('community_notification') as batch:
            if 'fk_community_notification_event' in fks:
                batch.drop_constraint('fk_community_notification_event', type_='foreignkey')
            if 'event_id' in cols:
                batch.drop_column('event_id')
            batch.alter_column('discussion_id', existing_type=sa.Integer(), nullable=False)

    if 'discussion' in tables:
        cols = {c['name'] for c in inspector.get_columns('discussion')}
        if 'share_disabled' in cols:
            with op.batch_alter_table('discussion') as batch:
                batch.drop_column('share_disabled')

    for table in _NEW_TABLES:
        if table not in tables:
            continue
        existing = {ix['name'] for ix in inspector.get_indexes(table)}
        for name, _cols, _unique in _INDEXES.get(table, ()):
            if name in existing:
                op.drop_index(name, table_name=table)
        op.drop_table(table)
