"""The only code that changes a status (Section 6).

transition() does a conditional update (... where id = $1 and status = $from) and writes an
activity_log row in the same transaction. It returns the updated row, or None when the row was not
in from_status (the transition lost a race, and the caller must stop).
"""
from collections.abc import Callable
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection, sql

from app.activity import log_activity

INVOICE_TRANSITIONS: set[tuple[str, str]] = {
    ("draft", "sent"),
    ("draft", "failed"),
    ("sent", "paid"),
    ("sent", "cancelled"),
}

# (from, to) -> action types allowed to make that move
ACTION_TRANSITIONS: dict[tuple[str, str], tuple[str, ...]] = {
    ("locked", "awaiting_approval"): ("payout",),
    ("locked", "cancelled"): ("payout",),
    ("awaiting_approval", "rejected"): ("payout", "invoice_reminder"),
    ("awaiting_approval", "executing"): ("payout", "invoice_reminder"),
    ("awaiting_approval", "cancelled"): ("payout", "invoice_reminder"),  # payout: its invoice was refunded
    ("executing", "submitted"): ("payout",),
    ("executing", "succeeded"): ("invoice_reminder",),
    ("executing", "failed"): ("payout", "invoice_reminder"),
    ("submitted", "succeeded"): ("payout",),
    ("submitted", "failed"): ("payout",),
}

# Columns a transition may set alongside the status.
_SETTABLE = {
    "invoices": {"paypal_invoice_id", "paypal_status", "sent_at", "paid_at", "error"},
    "pending_actions": {"paypal_payout_batch_id", "error", "decided_at", "executed_at", "draft_message", "summary"},
}
_ENTITY = {"invoices": ("invoice", "invoice_status"), "pending_actions": ("pending_action", "action_status")}

NOW = object()  # sentinel: set the column to now()


async def transition(
    conn: AsyncConnection,
    table: str,
    row_id: UUID,
    from_status: str,
    to_status: str,
    *,
    actor: str,
    event: str,
    message: str | Callable[[dict], str],
    owner_id: UUID | None = None,
    set_fields: dict[str, Any] | None = None,
    details: dict | None = None,
) -> dict | None:
    if table == "invoices":
        if (from_status, to_status) not in INVOICE_TRANSITIONS:
            raise ValueError(f"invoice transition {from_status} -> {to_status} is not allowed")
        types = None
    elif table == "pending_actions":
        types = ACTION_TRANSITIONS.get((from_status, to_status))
        if types is None:
            raise ValueError(f"action transition {from_status} -> {to_status} is not allowed")
    else:
        raise ValueError(f"unknown table {table}")

    entity_type, enum_name = _ENTITY[table]
    fields = set_fields or {}
    bad = set(fields) - _SETTABLE[table]
    if bad:
        raise ValueError(f"transition cannot set {sorted(bad)} on {table}")

    assignments = [sql.SQL("status = {}::{}").format(sql.Placeholder(), sql.Identifier(enum_name))]
    params: list[Any] = [to_status]
    for col, value in fields.items():
        if value is NOW:
            assignments.append(sql.SQL("{} = now()").format(sql.Identifier(col)))
        else:
            assignments.append(sql.SQL("{} = {}").format(sql.Identifier(col), sql.Placeholder()))
            params.append(value)

    where = [sql.SQL("id = {}").format(sql.Placeholder()),
             sql.SQL("status = {}::{}").format(sql.Placeholder(), sql.Identifier(enum_name))]
    params += [row_id, from_status]
    if owner_id is not None:
        where.append(sql.SQL("owner_id = {}").format(sql.Placeholder()))
        params.append(owner_id)
    if types is not None:
        where.append(sql.SQL("type = any({}::action_type[])").format(sql.Placeholder()))
        params.append(list(types))

    query = sql.SQL("update {} set {} where {} returning *").format(
        sql.Identifier(table), sql.SQL(", ").join(assignments), sql.SQL(" and ").join(where)
    )
    cur = await conn.execute(query, params)
    row = await cur.fetchone()
    if row is None:
        return None

    await log_activity(
        conn,
        owner_id=row["owner_id"],
        actor=actor,
        event=event,
        message=message(row) if callable(message) else message,
        entity_type=entity_type,
        entity_id=row["id"],
        details={"from": from_status, "to": to_status, **(details or {})},
    )
    return row
