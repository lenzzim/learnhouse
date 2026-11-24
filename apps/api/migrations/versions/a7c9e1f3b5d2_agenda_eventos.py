"""Agenda de eventos: regiões, eventos presenciais, vagas, cancelamento,
grupo de organizadores e "Minha agenda" (feed ICS pessoal e e-mail)

- ``community_event_region``: regiões por org (editáveis pelo admin). Semeia,
  para cada org, Online, São Paulo, Campinas, São Carlos, Rio de Janeiro e
  Minas Gerais (nessa ordem);
- ``community_event``: ``kind`` (tipo, padrão ``bible_talk``), ``region_id``,
  ``mode`` (``online``/``in_person``), ``city`` e ``neighborhood`` (públicos),
  ``address`` (privado), ``capacity`` (vagas, opcional) e ``status``
  (``scheduled``/``cancelled``). Os bate-papos existentes viram Bible Talk
  online na região Online;
- ``community_org_settings``: ``organizers_usergroup_id`` e
  ``organizers_configured`` (enquanto False, vale o grupo "Discípulos");
- ``community_agenda_pref``: hash do token do feed pessoal e opt-out de
  lembretes por e-mail.

Idempotente (o que o ``create_all`` já criou é pulado). O downgrade remove
tudo o que esta migração cria; os dados de eventos antigos (título, data,
link, presenças) ficam intactos.

Revision ID: a7c9e1f3b5d2
Revises: f0a1b2c3d4e5
Create Date: 2026-11-24

"""
from datetime import datetime
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
import sqlmodel  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = 'a7c9e1f3b5d2'
down_revision: Union[str, None] = 'f0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_DEFAULT_REGIONS = (
    ('online', 'Online', True),
    ('sao-paulo', 'São Paulo', False),
    ('campinas', 'Campinas', False),
    ('sao-carlos', 'São Carlos', False),
    ('rio-de-janeiro', 'Rio de Janeiro', False),
    ('minas-gerais', 'Minas Gerais', False),
)

_EVENT_COLUMNS = (
    ('kind', lambda: sa.Column('kind', sa.String(20), nullable=False, server_default='bible_talk')),
    ('region_id', lambda: sa.Column('region_id', sa.Integer(), nullable=True)),
    ('mode', lambda: sa.Column('mode', sa.String(12), nullable=False, server_default='online')),
    ('city', lambda: sa.Column('city', sa.String(120), nullable=False, server_default='')),
    ('neighborhood', lambda: sa.Column('neighborhood', sa.String(120), nullable=False, server_default='')),
    ('address', lambda: sa.Column('address', sa.String(300), nullable=False, server_default='')),
    ('capacity', lambda: sa.Column('capacity', sa.Integer(), nullable=True)),
    ('status', lambda: sa.Column('status', sa.String(12), nullable=False, server_default='scheduled')),
)

_FK_EVENT_REGION = 'fk_community_event_region_id'
_FK_ORGANIZERS = 'fk_community_org_settings_organizers_usergroup'


def _columns(inspector, table):
    return {c['name'] for c in inspector.get_columns(table)}


def _fks(inspector, table):
    return {fk.get('name') for fk in inspector.get_foreign_keys(table)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if 'community_event_region' not in tables:
        op.create_table(
            'community_event_region',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('region_uuid', sa.String(), nullable=False, server_default=''),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('slug', sa.String(60), nullable=False),
            sa.Column('name', sa.String(80), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('is_online', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('org_id', 'slug', name='uq_community_event_region_slug'),
        )
    inspector = sa.inspect(bind)
    idx = {i['name'] for i in inspector.get_indexes('community_event_region')}
    if 'ix_community_event_region_org' not in idx:
        op.create_index('ix_community_event_region_org', 'community_event_region', ['org_id', 'position'])
    if 'ix_community_event_region_region_uuid' not in idx:
        op.create_index('ix_community_event_region_region_uuid', 'community_event_region', ['region_uuid'])

    if 'community_agenda_pref' not in tables:
        op.create_table(
            'community_agenda_pref',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
            sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
            sa.Column('feed_token_hash', sa.String(64), nullable=True, unique=True),
            sa.Column('feed_created_at', sa.String(40), nullable=False, server_default=''),
            sa.Column('email_reminders', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
            sa.Column('update_date', sa.String(), nullable=False, server_default=''),
            sa.UniqueConstraint('user_id', 'org_id', name='uq_community_agenda_pref_user_org'),
        )

    cols = _columns(inspector, 'community_event')
    for name, factory in _EVENT_COLUMNS:
        if name not in cols:
            op.add_column('community_event', factory())
    inspector = sa.inspect(bind)
    if _FK_EVENT_REGION not in _fks(inspector, 'community_event') and not any(
        fk['referred_table'] == 'community_event_region' for fk in inspector.get_foreign_keys('community_event')
    ):
        op.create_foreign_key(
            _FK_EVENT_REGION, 'community_event', 'community_event_region', ['region_id'], ['id'], ondelete='SET NULL'
        )

    cols = _columns(inspector, 'community_org_settings')
    if 'organizers_usergroup_id' not in cols:
        op.add_column('community_org_settings', sa.Column('organizers_usergroup_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            _FK_ORGANIZERS, 'community_org_settings', 'usergroup', ['organizers_usergroup_id'], ['id'],
            ondelete='SET NULL',
        )
    if 'organizers_configured' not in cols:
        op.add_column(
            'community_org_settings',
            sa.Column('organizers_configured', sa.Boolean(), nullable=False, server_default=sa.false()),
        )

    # Regiões padrão para cada org sem nenhuma; eventos antigos -> Online.
    now = datetime.now().replace(microsecond=0).isoformat()
    org_ids = [r[0] for r in bind.execute(sa.text('SELECT id FROM organization')).fetchall()]
    for org_id in org_ids:
        n = bind.execute(
            sa.text('SELECT count(*) FROM community_event_region WHERE org_id = :o'), {'o': org_id}
        ).scalar()
        if not n:
            for pos, (slug, name, online) in enumerate(_DEFAULT_REGIONS):
                bind.execute(
                    sa.text(
                        'INSERT INTO community_event_region '
                        '(region_uuid, org_id, slug, name, position, is_online, active, creation_date, update_date) '
                        'VALUES (:u, :o, :s, :n, :p, :io, true, :d, :d)'
                    ),
                    {'u': f'region_{uuid4()}', 'o': org_id, 's': slug, 'n': name, 'p': pos, 'io': online, 'd': now},
                )
        bind.execute(
            sa.text(
                'UPDATE community_event SET region_id = ('
                '  SELECT r.id FROM community_event_region r'
                '  WHERE r.org_id = :o AND r.is_online ORDER BY r.position LIMIT 1'
                ') WHERE org_id = :o AND region_id IS NULL AND mode = \'online\''
            ),
            {'o': org_id},
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if 'community_org_settings' in tables:
        cols = _columns(inspector, 'community_org_settings')
        if _FK_ORGANIZERS in _fks(inspector, 'community_org_settings'):
            op.drop_constraint(_FK_ORGANIZERS, 'community_org_settings', type_='foreignkey')
        if 'organizers_usergroup_id' in cols:
            op.drop_column('community_org_settings', 'organizers_usergroup_id')
        if 'organizers_configured' in cols:
            op.drop_column('community_org_settings', 'organizers_configured')

    if 'community_event' in tables:
        inspector = sa.inspect(bind)
        for fk in inspector.get_foreign_keys('community_event'):
            if fk['referred_table'] == 'community_event_region' and fk.get('name'):
                op.drop_constraint(fk['name'], 'community_event', type_='foreignkey')
        cols = _columns(inspector, 'community_event')
        for name, _factory in reversed(_EVENT_COLUMNS):
            if name in cols:
                op.drop_column('community_event', name)

    # Avisos novos (cancelamento/mudança) não existem antes desta migração.
    if 'community_notification' in tables:
        bind.execute(sa.text(
            "DELETE FROM community_notification WHERE kind IN ('event_cancelled', 'event_changed')"
        ))

    for table in ('community_agenda_pref', 'community_event_region'):
        if table in tables:
            op.drop_table(table)
