"""Approve and reject (Section 10). Approve is the only place money moves."""
import logging
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from app.errors import AppError
from app.paypal_contract import PayPalAdapter, PayPalError
from app.transitions import NOW, transition

log = logging.getLogger(__name__)

MAX_REMINDER_CHARS = 500


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
        cur = await conn.execute("select email from contacts where id = %s", (action["payee_contact_id"],))
        payee = await cur.fetchone()
    try:
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


_MISSING_IN_PAYPAL = {"RESOURCE_NOT_FOUND", "INVALID_RESOURCE_ID"}


async def _send_reminder(pool: AsyncConnectionPool, adapter: PayPalAdapter, action: dict) -> dict:
    async with pool.connection() as conn:
        cur = await conn.execute("select paypal_invoice_id from invoices where id = %s",
                                 (action["trigger_invoice_id"],))
        invoice = await cur.fetchone()
    try:
        if invoice is None or not invoice["paypal_invoice_id"]:
            raise PayPalError("NO_PAYPAL_INVOICE", "The invoice was never sent through PayPal")
        await adapter.send_invoice_reminder(invoice["paypal_invoice_id"], action["draft_message"])
    except PayPalError as e:
        code, message = e.code, e.message
        if code in _MISSING_IN_PAYPAL:
            try:
                await adapter.get_invoice(invoice["paypal_invoice_id"])
            except PayPalError as lookup:
                if lookup.code in _MISSING_IN_PAYPAL:
                    code = "INVOICE_NOT_FOUND_IN_PAYPAL"
                    message = "PayPal couldn't find this invoice, so the reminder can't be sent."
            except Exception:
                log.exception("get_invoice lookup failed after reminder RESOURCE_NOT_FOUND")
        async with pool.connection() as conn:
            async with conn.transaction():
                row = await transition(
                    conn, "pending_actions", action["id"], "executing", "failed", actor="paypal",
                    event="reminder.failed", message=f"{action['summary']}: reminder failed ({message})",
                    set_fields={"error": f"{code}: {message}"},
                )
                if code == "INVOICE_NOT_FOUND_IN_PAYPAL" and action.get("trigger_invoice_id"):
                    await conn.execute(
                        "update invoices set error = %s, paypal_status = coalesce(paypal_status, 'NOT_FOUND') "
                        "where id = %s and error is null",
                        (f"{code}: {message}", action["trigger_invoice_id"]),
                    )
        return row or action
    async with pool.connection() as conn:
        async with conn.transaction():
            row = await transition(
                conn, "pending_actions", action["id"], "executing", "succeeded", actor="paypal",
                event="reminder.sent", message=f"{action['summary']}: reminder sent by PayPal",
                set_fields={"executed_at": NOW},
            )
            await conn.execute("update invoices set last_reminder_at = now() where id = %s",
                               (action["trigger_invoice_id"],))
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
