"""Back the demo seed's sent invoices with real PayPal sandbox invoices.

seed.sql gives sent invoices placeholder ids (DEMO-INV-…) that PayPal has never seen, so reminders and
payments on them fail with "invoice not found". This creates and sends a matching sandbox invoice for
each one (same client, amount, invoice date and due date), stores the real INV2-… id on the row, and
puts the seed's reminders back in the approval queue.

Run from backend/server after seeding, with PAYPAL_ADAPTER=real credentials in .env:
    .venv/bin/python -m scripts.link_seed_to_paypal
Safe to re-run: rows that already have a real id are skipped.
"""
import asyncio
import os

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings
from app.paypal import get_paypal_adapter

DEMO_EMAIL = "demo@paysasa.app"
SEED_REMINDERS = ("22222222-2222-4222-8222-222222222203", "22222222-2222-4222-8222-222222222206")


def _amount(minor: int) -> str:
    return f"{minor // 100}.{minor % 100:02d}"


async def main() -> None:
    settings = get_settings()
    if settings.paypal_adapter != "real":
        raise SystemExit("PAYPAL_ADAPTER must be 'real' so the invoices are created in PayPal.")
    adapter = get_paypal_adapter()
    with psycopg.connect(os.environ.get("DATABASE_URL") or settings.database_url, row_factory=dict_row) as conn:
        rows = conn.execute(
            """select i.id, i.description, i.amount_minor, i.currency, i.due_date, i.sent_at,
                      c.name as client_name, c.email as client_email
               from invoices i join contacts c on c.id = i.contact_id
               join auth.users u on u.id = i.owner_id
               where u.email = %s and i.status = 'sent' and i.paypal_invoice_id like 'DEMO-INV-%%'
               order by i.sent_at""",
            (DEMO_EMAIL,),
        ).fetchall()
        for inv in rows:
            currency = inv["currency"].strip()
            first, _, last = inv["client_name"].partition(" ")
            name = {"given_name": first, **({"surname": last} if last else {})}
            draft = await adapter._request("POST", "/v2/invoicing/invoices",
                                           headers={"Prefer": "return=representation"}, json={
                "detail": {"currency_code": currency, "reference": str(inv["id"]),
                           "invoice_date": inv["sent_at"].date().isoformat(),
                           "payment_term": {"due_date": inv["due_date"].isoformat()}},
                "primary_recipients": [{"billing_info": {"email_address": inv["client_email"], "name": name}}],
                "items": [{"name": inv["description"], "quantity": "1",
                           "unit_amount": {"currency_code": currency, "value": _amount(inv["amount_minor"])}}],
            })
            paypal_id = draft["id"]
            await adapter._request("POST", f"/v2/invoicing/invoices/{paypal_id}/send",
                                   json={"send_to_recipient": True, "send_to_invoicer": False})
            conn.execute("update invoices set paypal_invoice_id = %s, paypal_status = 'SENT' where id = %s",
                         (paypal_id, inv["id"]))
            conn.commit()
            print(f"{inv['client_name']}: {inv['description']} -> {paypal_id}")

        reopened = conn.execute(
            """update pending_actions set status = 'awaiting_approval', error = null, decided_at = null,
                      executed_at = null
               where id = any(%s::uuid[]) and status = 'failed' returning summary""",
            (list(SEED_REMINDERS),),
        ).fetchall()
        conn.commit()
        for r in reopened:
            print(f"back in approvals: {r['summary']}")
    print(f"linked {len(rows)} invoice(s) to PayPal")


if __name__ == "__main__":
    asyncio.run(main())
