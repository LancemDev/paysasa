"""PayPal event handlers (Section 8). Every function here runs inside the caller's transaction."""
import logging

from psycopg import AsyncConnection

from app.activity import log_activity
from app.money import format_money
from app.paypal_contract import PayPalAdapter
from app.transitions import NOW, transition

log = logging.getLogger(__name__)

PAID_STATUSES = ("PAID", "MARKED_AS_PAID")


class RetryLater(Exception):
    """A temporary condition; the route answers 500 so PayPal redelivers."""


async def _invoice_with_contact(conn: AsyncConnection, where: str, value) -> dict | None:
    cur = await conn.execute(
        f"""select i.*, c.name as contact_name from invoices i
            join contacts c on c.id = i.contact_id and c.owner_id = i.owner_id
            where {where} for update of i""",
        (value,),
    )
    return await cur.fetchone()


async def _open_actions(conn: AsyncConnection, invoice_id, type_: str, status: str) -> list[dict]:
    cur = await conn.execute(
        """select a.*, c.name as payee_name from pending_actions a
           left join contacts c on c.id = a.payee_contact_id and c.owner_id = a.owner_id
           where a.trigger_invoice_id = %s and a.type = %s::action_type and a.status = %s::action_status
           for update of a""",
        (invoice_id, type_, status),
    )
    return await cur.fetchall()


async def apply_invoice_paid(conn: AsyncConnection, invoice: dict, *, actor: str, paypal_status: str) -> dict | None:
    """sent -> paid, then unlock its payouts and cancel its open reminders."""
    money = format_money(invoice["amount_minor"], invoice["currency"])
    paid = await transition(
        conn, "invoices", invoice["id"], "sent", "paid", actor=actor, event="invoice.paid",
        message=f"{invoice['contact_name']} paid {money} for {invoice['description']}",
        set_fields={"paid_at": NOW, "paypal_status": paypal_status},
    )
    if paid is None:
        return None
    for a in await _open_actions(conn, invoice["id"], "payout", "locked"):
        amount = format_money(a["amount_minor"], a["currency"])
        await transition(
            conn, "pending_actions", a["id"], "locked", "awaiting_approval", actor=actor, event="payout.unlocked",
            message=f"Payout {a['payee_name']} {amount} unlocked: needs your approval",
            set_fields={"summary": f"Payout {a['payee_name']} {amount}"},
        )
    for a in await _open_actions(conn, invoice["id"], "invoice_reminder", "awaiting_approval"):
        await transition(
            conn, "pending_actions", a["id"], "awaiting_approval", "cancelled", actor=actor,
            event="reminder.cancelled", message=f"Reminder to {invoice['contact_name']} cancelled: invoice paid",
        )
    return paid


async def apply_invoice_cancelled(conn: AsyncConnection, invoice: dict, *, actor: str) -> dict | None:
    cancelled = await transition(
        conn, "invoices", invoice["id"], "sent", "cancelled", actor=actor, event="invoice.cancelled",
        message=f"Invoice to {invoice['contact_name']} for {invoice['description']} was cancelled",
        set_fields={"paypal_status": "CANCELLED"},
    )
    if cancelled is None:
        return None
    for a in await _open_actions(conn, invoice["id"], "payout", "locked"):
        await transition(
            conn, "pending_actions", a["id"], "locked", "cancelled", actor=actor, event="payout.cancelled",
            message=f"{a['summary']}: cancelled because the invoice was cancelled",
        )
    for a in await _open_actions(conn, invoice["id"], "invoice_reminder", "awaiting_approval"):
        await transition(
            conn, "pending_actions", a["id"], "awaiting_approval", "cancelled", actor=actor,
            event="reminder.cancelled", message=f"Reminder to {invoice['contact_name']} cancelled: invoice cancelled",
        )
    return cancelled


async def handle_invoice_paid(conn: AsyncConnection, adapter: PayPalAdapter, resource: dict) -> str | None:
    paypal_id = resource.get("id")
    invoice = await _invoice_with_contact(conn, "i.paypal_invoice_id = %s", paypal_id)
    if invoice is None:
        return f"unknown invoice {paypal_id}"
    state = await adapter.get_invoice(paypal_id)  # PayPalError -> temporary failure, PayPal retries
    if state.status not in PAID_STATUSES:
        await log_activity(
            conn, owner_id=invoice["owner_id"], actor="paypal", event="invoice.payment_partial",
            message=f"PayPal reported a payment on {invoice['contact_name']}'s invoice, status {state.status}; "
                    "waiting for full payment",
            entity_type="invoice", entity_id=invoice["id"],
            details={"paypal_status": state.status, "amount_paid_minor": state.amount_paid_minor},
        )
        return None
    if invoice["status"] != "sent":
        return None
    await apply_invoice_paid(conn, invoice, actor="paypal", paypal_status=state.status)
    return None


async def handle_invoice_cancelled(conn: AsyncConnection, resource: dict) -> str | None:
    paypal_id = resource.get("id")
    invoice = await _invoice_with_contact(conn, "i.paypal_invoice_id = %s", paypal_id)
    if invoice is None:
        return f"unknown invoice {paypal_id}"
    if invoice["status"] == "sent":
        await apply_invoice_cancelled(conn, invoice, actor="paypal")
    return None


async def handle_payout_batch(conn: AsyncConnection, resource: dict, *, success: bool) -> str | None:
    header = resource.get("batch_header") or {}
    batch_id = header.get("payout_batch_id")
    sender_batch_id = (header.get("sender_batch_header") or {}).get("sender_batch_id")
    cur = await conn.execute(
        """select * from pending_actions where type = 'payout'
           and (paypal_payout_batch_id = %s or idempotency_key = %s) for update""",
        (batch_id, sender_batch_id),
    )
    action = await cur.fetchone()
    if action is None:
        return f"unknown payout batch {batch_id}"
    if action["status"] == "executing":
        # The approve request has not recorded the batch id yet; ask PayPal to redeliver.
        raise RetryLater(f"payout {action['id']} still executing")
    if action["status"] != "submitted":
        return None
    if success:
        await transition(
            conn, "pending_actions", action["id"], "submitted", "succeeded", actor="paypal",
            event="payout.succeeded", message=f"{action['summary']}: PayPal completed the payout",
            set_fields={"paypal_payout_batch_id": batch_id},
        )
    else:
        await transition(
            conn, "pending_actions", action["id"], "submitted", "failed", actor="paypal",
            event="payout.failed", message=f"{action['summary']}: PayPal denied the payout",
            set_fields={"error": f"PayPal batch {batch_id} denied"},
        )
    return None
