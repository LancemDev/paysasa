"""Approve and reject (Section 10). Approve is the only place money moves."""
import logging
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.config import get_settings
from app.errors import AppError
from app.paypal_contract import PayPalAdapter, PayPalError
from app.transitions import NOW, transition

log = logging.getLogger(__name__)

MAX_REMINDER_CHARS = 500

# Payouts in these states still count against the invoice total. Failed, rejected
# and cancelled payouts did not move money and may be retried.
ACTIVE_PAYOUT_STATUSES = ("locked", "awaiting_approval", "executing", "submitted", "succeeded")


async def active_payout_total(conn, invoice_id: UUID, *, exclude_id: UUID | None = None) -> int:
    """Sum of payouts that are still committed to an invoice, optionally excluding one action."""
    query = """select coalesce(sum(amount_minor), 0) as total from pending_actions
               where trigger_invoice_id = %s and type = 'payout'
                 and status = any(%s::action_status[])"""
    params: list = [invoice_id, list(ACTIVE_PAYOUT_STATUSES)]
    if exclude_id is not None:
        query += " and id <> %s"
        params.append(exclude_id)
    cur = await conn.execute(query, params)
    return int((await cur.fetchone())["total"])


def action_out(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if isinstance(v, UUID):
            v = str(v)
        elif hasattr(v, "isoformat"):
            v = v.isoformat()
        elif k == "split_percent" and v is not None:
            v = str(v)
        out[k] = v
    return out


async def _get_owned(pool: AsyncConnectionPool, action_id: UUID, owner_id: UUID) -> dict:
    async with pool.connection() as conn:
        cur = await conn.execute("select * from pending_actions where id = %s and owner_id = %s", (action_id, owner_id))
        row = await cur.fetchone()
    if row is None:
        raise AppError(404, "not_found", "Action not found")
    return row


async def _display_name(conn, owner_id: UUID) -> str:
    cur = await conn.execute("select display_name from profiles where id = %s", (owner_id,))
    row = await cur.fetchone()
    return row["display_name"] if row else "You"


async def _check_payout_against_invoice(conn, action: dict) -> None:
    """Re-check every money guard at approval time, under the invoice row lock.

    schedule_payout enforces these too. Repeating them here means a legacy row, a
    manually edited database or a race cannot turn into a payout larger than the
    invoice it is attached to.
    """
    if action["type"] != "payout":
        return
    invoice_id = action["trigger_invoice_id"]
    amount_minor = action["amount_minor"]
    if invoice_id is None or amount_minor is None:
        raise AppError(409, "conflict", "This payout is not linked to an invoice")
    cur = await conn.execute(
        "select amount_minor, currency from invoices where id = %s and owner_id = %s for update",
        (invoice_id, action["owner_id"]),
    )
    invoice = await cur.fetchone()
    if invoice is None:
        raise AppError(404, "not_found", "The invoice for this payout no longer exists")
    action_currency = (action["currency"] or "").strip()
    if action_currency != invoice["currency"].strip():
        raise AppError(409, "conflict", "This payout's currency does not match its invoice")
    if amount_minor > get_settings().max_amount_minor:
        raise AppError(409, "conflict", "This payout exceeds the current amount limit")
    already_committed = await active_payout_total(conn, invoice_id, exclude_id=action["id"])
    if already_committed + amount_minor > invoice["amount_minor"]:
        raise AppError(409, "conflict", "This payout would exceed the invoice total")


async def approve(pool: AsyncConnectionPool, adapter: PayPalAdapter, *, action_id: UUID, owner_id: UUID,
                  message: str | None) -> dict:
    current = await _get_owned(pool, action_id, owner_id)
    if message is not None:
        message = message.strip()
        if current["type"] != "invoice_reminder":
            message = None  # only reminders carry an editable message
        elif not message or len(message) > MAX_REMINDER_CHARS:
            raise AppError(422, "invalid_request", f"message must be 1-{MAX_REMINDER_CHARS} characters")

    # 1-2. awaiting_approval -> executing, for this id and owner. Losing the race means 409.
    async with pool.connection() as conn:
        name = await _display_name(conn, owner_id)
        await _check_payout_against_invoice(conn, current)
        verb = "payout" if current["type"] == "payout" else "reminder"
        fields = {"decided_at": NOW}
        if message:
            fields["draft_message"] = message
        action = await transition(
            conn, "pending_actions", action_id, "awaiting_approval", "executing", actor="user",
            event=f"{verb}.approved", message=lambda r: f"{name} approved: {r['summary']}",
            owner_id=owner_id, set_fields=fields,
        )
    if action is None:
        raise AppError(409, "conflict", f"Action is {current['status']}, not awaiting approval")

    # 3-4. Call PayPal, then record the outcome.
    if action["type"] == "payout":
        return action_out(await _execute_payout(pool, adapter, action))
    return action_out(await _send_reminder(pool, adapter, action))


async def _execute_payout(pool: AsyncConnectionPool, adapter: PayPalAdapter, action: dict) -> dict:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "select email, role from contacts where id = %s and owner_id = %s",
            (action["payee_contact_id"], action["owner_id"]),
        )
        payee = await cur.fetchone()
    try:
        if payee is None or payee["role"] != "contractor":
            raise PayPalError("PAYEE_UNAVAILABLE", "The payout recipient is no longer an available contractor")
        result = await adapter.execute_payout(
            sender_batch_id=action["idempotency_key"], recipient_email=payee["email"],
            amount_minor=action["amount_minor"], currency=action["currency"].strip(), note=action["summary"],
        )
    except PayPalError as e:
        async with pool.connection() as conn:
            row = await transition(
                conn, "pending_actions", action["id"], "executing", "failed", actor="paypal",
                event="payout.failed", message=f"{action['summary']}: PayPal rejected the payout ({e.message})",
                set_fields={"error": f"{e.code}: {e.message}"},
            )
        return row or action
    # Any other exception leaves the action in executing: PayPal may or may not have accepted it, and the
    # idempotency key makes a manual retry safe. It surfaces as a 500 and in the server log.
    async with pool.connection() as conn:
        row = await transition(
            conn, "pending_actions", action["id"], "executing", "submitted", actor="paypal",
            event="payout.submitted", message=f"{action['summary']}: submitted to PayPal",
            set_fields={"paypal_payout_batch_id": result.payout_batch_id, "executed_at": NOW},
            details={"batch_status": result.batch_status},
        )
    return row or action


async def _send_reminder(pool: AsyncConnectionPool, adapter: PayPalAdapter, action: dict) -> dict:
    async with pool.connection() as conn:
        cur = await conn.execute(
            "select paypal_invoice_id, status from invoices where id = %s and owner_id = %s",
            (action["trigger_invoice_id"], action["owner_id"]),
        )
        invoice = await cur.fetchone()
    try:
        if invoice is None or not invoice["paypal_invoice_id"]:
            raise PayPalError("NO_PAYPAL_INVOICE", "The invoice was never sent through PayPal")
        if invoice["status"] != "sent":
            raise PayPalError("INVOICE_NOT_OPEN", f"The invoice is {invoice['status']}, so no reminder is needed")
        await adapter.send_invoice_reminder(invoice["paypal_invoice_id"], action["draft_message"])
    except PayPalError as e:
        async with pool.connection() as conn:
            row = await transition(
                conn, "pending_actions", action["id"], "executing", "failed", actor="paypal",
                event="reminder.failed", message=f"{action['summary']}: reminder failed ({e.message})",
                set_fields={"error": f"{e.code}: {e.message}"},
            )
        return row or action
    async with pool.connection() as conn:
        async with conn.transaction():
            row = await transition(
                conn, "pending_actions", action["id"], "executing", "succeeded", actor="paypal",
                event="reminder.sent", message=f"{action['summary']}: reminder sent by PayPal",
                set_fields={"executed_at": NOW},
            )
            await conn.execute("update invoices set last_reminder_at = now() where id = %s and owner_id = %s",
                               (action["trigger_invoice_id"], action["owner_id"]))
    return row or action


async def reject(pool: AsyncConnectionPool, *, action_id: UUID, owner_id: UUID, reason: str | None) -> dict:
    current = await _get_owned(pool, action_id, owner_id)
    reason = (reason or "").strip() or None
    async with pool.connection() as conn:
        name = await _display_name(conn, owner_id)
        row = await transition(
            conn, "pending_actions", action_id, "awaiting_approval", "rejected", actor="user",
            event="payout.rejected" if current["type"] == "payout" else "reminder.rejected",
            message=lambda r: f"{name} rejected: {r['summary']}" + (f" ({reason})" if reason else ""),
            owner_id=owner_id, set_fields={"decided_at": NOW, "error": reason}, details={"reason": reason},
        )
    if row is None:
        raise AppError(409, "conflict", f"Action is {current['status']}, not awaiting approval")
    return action_out(row)
