import json
import uuid

from app.paypal_contract import InvoiceItem
from app.paypal_mock import MOCK_SIGNATURE
from tests.conftest import fetchone


async def sent_invoice_with_payout(pool, adapter, user, *, with_reminder=False):
    """A sent invoice (also registered in the mock adapter) with a locked 20% payout to Sarah."""
    sent = await adapter.create_and_send_invoice(
        reference="ref", recipient_email="john@example.com", currency="USD",
        items=[InvoiceItem(name="Q3 Video Campaign", quantity=1, unit_amount_minor=120000)],
    )
    async with pool.connection() as conn:
        cur = await conn.execute(
            """insert into invoices (owner_id, contact_id, description, amount_minor, currency, status,
                   paypal_invoice_id, due_date, sent_at)
               values (%s, %s, 'Q3 Video Campaign', 120000, 'USD', 'sent', %s, current_date - 5, now()) returning id""",
            (user["id"], user["john"], sent.paypal_invoice_id),
        )
        inv_id = (await cur.fetchone())["id"]
        cur = await conn.execute(
            """insert into pending_actions (owner_id, type, status, trigger_invoice_id, payee_contact_id,
                   amount_minor, currency, split_percent, summary, idempotency_key)
               values (%s, 'payout', 'locked', %s, %s, 24000, 'USD', 20, 'Payout Sarah $240.00 upon settlement', %s)
               returning id""",
            (user["id"], inv_id, user["sarah"], f"payout-{uuid.uuid4().hex}"),
        )
        payout_id = (await cur.fetchone())["id"]
        reminder_id = None
        if with_reminder:
            cur = await conn.execute(
                """insert into pending_actions (owner_id, type, status, trigger_invoice_id, summary, draft_message,
                       idempotency_key)
                   values (%s, 'invoice_reminder', 'awaiting_approval', %s, 'Remind John Doe', 'Please pay', %s)
                   returning id""",
                (user["id"], inv_id, f"reminder-{uuid.uuid4().hex}"),
            )
            reminder_id = (await cur.fetchone())["id"]
    return {"invoice_id": inv_id, "paypal_invoice_id": sent.paypal_invoice_id,
            "payout_id": payout_id, "reminder_id": reminder_id}


def event(event_type, resource, event_id=None):
    return {"id": event_id or f"WH-{uuid.uuid4().hex}", "event_type": event_type, "resource": resource}


async def deliver(client, ev, signature=MOCK_SIGNATURE):
    return await client.post("/webhooks/paypal", content=json.dumps(ev).encode(),
                             headers={"paypal-transmission-sig": signature, "content-type": "application/json"})


async def status(pool, table, row_id):
    return (await fetchone(pool, f"select status from {table} where id = %s", row_id))["status"]
