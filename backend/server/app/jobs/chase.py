"""Daily overdue-chasing job (Section 9). Run with: python -m app.jobs.chase

Queues an LLM-drafted reminder for approval per overdue invoice. Nothing reaches a client until approved.
"""
import asyncio
import logging
import uuid
from datetime import date

from psycopg_pool import AsyncConnectionPool

from app.activity import log_activity
from app.agent.draft_reminder import draft_reminder
from app.agent.llm import LLM
from app.money import format_money

log = logging.getLogger(__name__)

REMINDER_GAP = "3 days"


async def run_chase(pool: AsyncConnectionPool, llm: LLM | None, today: date | None = None) -> int:
    today = today or date.today()
    async with pool.connection() as conn:
        cur = await conn.execute(
            f"""select i.id, i.owner_id, i.description, i.amount_minor, i.currency, i.due_date,
                       c.name as client_name, coalesce(p.display_name, 'Your supplier') as sender_name
                from invoices i
                join contacts c on c.id = i.contact_id
                left join profiles p on p.id = i.owner_id
                where i.status = 'sent' and i.due_date < %s
                  and coalesce(i.error, '') not like 'INVOICE_NOT_FOUND_IN_PAYPAL:%%'
                  and (i.last_reminder_at is null or i.last_reminder_at < now() - interval '{REMINDER_GAP}')
                  and not exists (select 1 from pending_actions a
                                  where a.trigger_invoice_id = i.id and a.type = 'invoice_reminder'
                                    and a.status in ('locked', 'awaiting_approval', 'executing'))
                order by i.due_date""",
            (today,),
        )
        overdue = await cur.fetchall()

    created = 0
    for inv in overdue:
        days = (today - inv["due_date"]).days
        currency = inv["currency"].strip()
        note = await draft_reminder(
            llm, client_name=inv["client_name"], sender_name=inv["sender_name"], description=inv["description"],
            amount_minor=inv["amount_minor"], currency=currency, due_date=inv["due_date"], days_overdue=days,
        )
        money = format_money(inv["amount_minor"], currency)
        summary = f"Remind {inv['client_name']}: {money} is {days} day{'s' if days != 1 else ''} overdue"
        async with pool.connection() as conn:
            # The not-exists guard makes overlapping runs safe.
            cur = await conn.execute(
                """insert into pending_actions (owner_id, type, status, trigger_invoice_id, summary,
                                                draft_message, idempotency_key)
                   select %s, 'invoice_reminder', 'awaiting_approval', %s, %s, %s, %s
                   where not exists (select 1 from pending_actions a
                                     where a.trigger_invoice_id = %s and a.type = 'invoice_reminder'
                                       and a.status in ('locked', 'awaiting_approval', 'executing'))
                   returning id""",
                (inv["owner_id"], inv["id"], summary, note, f"reminder-{uuid.uuid4().hex}", inv["id"]),
            )
            row = await cur.fetchone()
            if row is None:
                continue
            await log_activity(conn, owner_id=inv["owner_id"], actor="system", event="reminder.drafted",
                               message=f"Drafted a reminder for approval: {summary}",
                               entity_type="pending_action", entity_id=row["id"])
        created += 1
    return created


async def main() -> None:
    from app.agent.llm import get_llm
    from app.config import get_settings
    from app.db import close_pool, open_pool

    settings = get_settings()
    pool = await open_pool(settings.database_url, min_size=1, max_size=2)
    try:
        llm = get_llm() if settings.anthropic_api_key else None
        created = await run_chase(pool, llm)
        log.info("chase job queued %d reminder(s)", created)
    finally:
        await close_pool()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
