"""Lembretes de bate-papo por e-mail (opcional, N45).

Os lembretes no app são gerados sob demanda (ver ``batepapos.py``). O e-mail
precisa de alguém acordado na hora certa, então roda num laço ``asyncio``
dentro da API, no mesmo molde de ``nudges/scheduler.py``: sem fila, sem cron.

Desligado por padrão. Liga com ``DISCIPULEI_LEMBRETES_EMAIL=1`` e só faz
sentido com o envio de e-mail do LearnHouse configurado (Resend ou SMTP).
Cada lembrete é criado uma única vez (índice único por pessoa, encontro e
tipo), então várias réplicas acordando juntas não mandam e-mail repetido: só
quem cria a notificação envia. Sai e-mail para "falta 1 dia" e "começa em 15
minutos"; o "Começou!" fica só no app. O aviso de cancelamento sai na hora em
que o evento é cancelado (``send_cancellation``), com a mesma flag.

Opt-out por pessoa: ``community_agenda_pref.email_reminders`` (padrão ligado;
a pessoa desliga em "Minha agenda", na página da Agenda). O e-mail nunca leva
endereço nem link da reunião: só título, data e o caminho da agenda.
"""

from __future__ import annotations

import asyncio
import html
import logging
from datetime import timedelta
from typing import Optional

from sqlmodel import select

logger = logging.getLogger(__name__)

TICK_SECONDS = 60
STARTUP_DELAY_SECONDS = 45

_task: Optional[asyncio.Task] = None


async def run_tick() -> int:
    """Gera os lembretes devidos de todo mundo e manda os e-mails. Devolve quantos."""
    from src.core.events.database import _async_session_factory
    from src.db.communities.batepapos import (
        DURATION_MAX,
        NOTIFICATION_EVENT_15M,
        NOTIFICATION_EVENT_1D,
        RSVP_STATUSES,
        CommunityEvent,
        CommunityEventRsvp,
    )
    from src.db.users import User
    from src.services.communities.agenda import email_opted_out
    from src.services.communities.batepapos import fmt_utc, generate_due_reminders, parse_utc, utcnow

    now = utcnow()
    sent = 0
    async with _async_session_factory() as db:
        user_ids = (await db.execute(
            select(CommunityEventRsvp.user_id)
            .join(CommunityEvent, CommunityEvent.id == CommunityEventRsvp.event_id)
            .where(
                CommunityEventRsvp.status.in_(RSVP_STATUSES),  # type: ignore[attr-defined]
                CommunityEvent.starts_at >= fmt_utc(now - timedelta(minutes=DURATION_MAX)),
                CommunityEvent.starts_at <= fmt_utc(now + timedelta(days=1)),
                CommunityEvent.status != "cancelled",
            )
            .distinct()
        )).scalars().all()
        for uid in user_ids:
            created = await generate_due_reminders(db, uid, None, now)
            to_mail = [n for n in created if n.kind in (NOTIFICATION_EVENT_1D, NOTIFICATION_EVENT_15M)]
            if not to_mail:
                continue
            user = (await db.execute(select(User).where(User.id == uid))).scalars().first()
            if not user or not user.email:
                continue
            for n in to_mail:
                ev = (await db.execute(select(CommunityEvent).where(CommunityEvent.id == n.event_id))).scalars().first()
                if not ev or await email_opted_out(db, uid, ev.org_id):
                    continue
                try:
                    _send(user.email, ev, n.kind == NOTIFICATION_EVENT_15M, parse_utc)
                    sent += 1
                except Exception as exc:  # pragma: no cover - provedor externo
                    logger.warning("Lembrete de bate-papo não enviado: %s", exc)
    return sent


def _send(to: str, ev, soon: bool, parse_utc) -> None:
    from zoneinfo import ZoneInfo

    from src.services.email.utils import send_email

    start = parse_utc(ev.starts_at).astimezone(ZoneInfo(ev.timezone or "America/Sao_Paulo"))
    quando = start.strftime("%d/%m/%Y às %H:%M")
    titulo = html.escape(ev.title)
    assunto = f"Começa em 15 minutos: {ev.title}" if soon else f"Amanhã: {ev.title}"
    corpo = (
        f"<p>Lembrete do evento <strong>{titulo}</strong>.</p>"
        f"<p>{html.escape(quando)} ({html.escape(ev.timezone or '')}).</p>"
        "<p>Endereço e link estão na Agenda do app (só para quem confirmou).</p>"
        "<p style=\"color:#666;font-size:12px\">Para não receber estes e-mails, desligue"
        " \"Lembretes por e-mail\" em Agenda &gt; Minha agenda.</p>"
    )
    send_email(to=to, subject=assunto, body=corpo)


def send_cancellation(to: str, ev) -> None:
    """Aviso de cancelamento (síncrono; quem chama roda numa thread)."""
    from zoneinfo import ZoneInfo

    from src.services.communities.batepapos import parse_utc
    from src.services.email.utils import send_email

    start = parse_utc(ev.starts_at).astimezone(ZoneInfo(ev.timezone or "America/Sao_Paulo"))
    quando = start.strftime("%d/%m/%Y às %H:%M")
    corpo = (
        f"<p>O evento <strong>{html.escape(ev.title)}</strong>, marcado para"
        f" {html.escape(quando)}, foi <strong>cancelado</strong>.</p>"
        "<p style=\"color:#666;font-size:12px\">Para não receber estes e-mails, desligue"
        " \"Lembretes por e-mail\" em Agenda &gt; Minha agenda.</p>"
    )
    send_email(to=to, subject=f"Cancelado: {ev.title}", body=corpo)


async def _loop() -> None:
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            await run_tick()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Lembretes de bate-papo falharam, tento de novo: %s", exc)
        await asyncio.sleep(TICK_SECONDS)


def start_scheduler() -> None:
    """Liga o laço só com ``DISCIPULEI_LEMBRETES_EMAIL=1``. Nunca levanta."""
    global _task
    try:
        from src.services.communities.batepapos import email_reminders_enabled

        if not email_reminders_enabled():
            return
        if _task is None or _task.done():
            _task = asyncio.get_event_loop().create_task(_loop())
            logger.info("Lembretes de bate-papo por e-mail ligados")
    except Exception as exc:  # pragma: no cover
        logger.warning("Lembretes de bate-papo por e-mail não iniciaram: %s", exc)


async def stop_scheduler() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        try:
            await _task
        except (asyncio.CancelledError, Exception):
            pass
        _task = None
