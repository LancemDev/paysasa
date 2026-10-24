"""The six tools the LLM may call. Guardrails live here, in code, not in the prompt.

No tool approves or executes a payout; schedule_payout only queues a locked action.
"""
import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated, Any
from uuid import UUID

from psycopg_pool import AsyncConnectionPool
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.actions.service import active_payout_total
from app.activity import log_activity
from app.agent.llm import ToolSpec
from app.money import (
    ALLOWED_CURRENCIES, MoneyError, check_currency, format_money, parse_amount,
    parse_percent_hundredths, split_amount,
)
from app.paypal_contract import InvoiceItem, PayPalAdapter, PayPalError
from app.transitions import NOW, transition

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
Alias = Annotated[str, Field(max_length=100)]


class ToolError(Exception):
    """A problem the LLM should explain to the user. Sent back as { "error": "..." }."""


@dataclass
class ToolContext:
    pool: AsyncConnectionPool
    adapter: PayPalAdapter
    owner_id: UUID
    run_id: UUID
    user_message: str
    default_currency: str
    max_amount_minor: int
    today: date


def _uuid(value: str, what: str) -> UUID:
    try:
        return UUID(str(value))
    except ValueError:
        raise ToolError(f"{what} {value!r} is not a valid id")


def _as_str(v: Any) -> Any:
    if isinstance(v, bool):
        return v
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        return repr(v)
    return v


def _check_amount(ctx: ToolContext, amount_minor: int, currency: str) -> None:
    if amount_minor <= 0:
        raise ToolError("Amount must be greater than zero.")
    if amount_minor > ctx.max_amount_minor:
        raise ToolError(f"Amount exceeds the limit of {format_money(ctx.max_amount_minor, currency)}.")


async def _get_contact(conn, ctx: ToolContext, contact_id: UUID) -> dict:
    cur = await conn.execute(
        "select id, name, email, role, aliases from contacts where id = %s and owner_id = %s",
        (contact_id, ctx.owner_id),
    )
    row = await cur.fetchone()
    if row is None:
        raise ToolError(f"No contact with id {contact_id}.")
    return row


def _contact_out(c: dict) -> dict:
    return {"contact_id": str(c["id"]), "name": c["name"], "email": c["email"],
            "role": c["role"], "aliases": list(c["aliases"])}


# --- find_contact --------------------------------------------------------------

class FindContactArgs(BaseModel):
    query: str = Field(min_length=1, max_length=200)


async def find_contact(ctx: ToolContext, args: FindContactArgs) -> tuple[dict, str]:
    q = args.query.strip()
    async with ctx.pool.connection() as conn:
        cur = await conn.execute(
            """select id, name, email, role, aliases from contacts
               where owner_id = %s and (lower(name) = lower(%s) or lower(email) = lower(%s)
                     or exists (select 1 from unnest(aliases) a where lower(a) = lower(%s)))
               order by name""",
            (ctx.owner_id, q, q, q),
        )
        rows = await cur.fetchall()
        if not rows:
            like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            cur = await conn.execute(
                """select id, name, email, role, aliases from contacts
                   where owner_id = %s and (name ilike %s or email ilike %s
                         or exists (select 1 from unnest(aliases) a where a ilike %s))
                   order by name limit 10""",
                (ctx.owner_id, like, like, like),
            )
            rows = await cur.fetchall()
    matches = [_contact_out(r) for r in rows]
    n = len(matches)
    msg = f"Looked up contact “{q}”: " + ("no match" if n == 0 else f"{n} match" + ("" if n == 1 else "es"))
    return {"matches": matches, "count": n}, msg


# --- create_contact ------------------------------------------------------------

class CreateContactArgs(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    role: str
    aliases: list[Alias] = Field(default_factory=list, max_length=10)

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ("client", "contractor"):
            raise ValueError("role must be 'client' or 'contractor'")
        return v


async def create_contact(ctx: ToolContext, args: CreateContactArgs) -> tuple[dict, str]:
    email = args.email.strip()
    if not _EMAIL_RE.match(email):
        raise ToolError(f"{email!r} is not a valid email address.")
    if email.lower() not in ctx.user_message.lower():
        raise ToolError("A contact can only be created with an email the user typed in this message. Ask the user for it.")
    aliases = [a.strip() for a in args.aliases if a.strip()]
    async with ctx.pool.connection() as conn:
        cur = await conn.execute(
            """insert into contacts (owner_id, name, email, role, aliases) values (%s, %s, %s, %s, %s)
               on conflict (owner_id, email) do nothing returning id, name, email, role, aliases""",
            (ctx.owner_id, args.name.strip(), email, args.role, aliases),
        )
        row = await cur.fetchone()
        if row is None:
            raise ToolError(f"A contact with email {email} already exists. Use find_contact.")
    return {"contact": _contact_out(row)}, f"Added contact {row['name']} ({row['role']}, {row['email']})"


# --- send_invoice --------------------------------------------------------------

class SendInvoiceArgs(BaseModel):
    contact_id: str
    description: str = Field(min_length=1, max_length=500)
    amount: str
    currency: str | None = None
    due_in_days: int = Field(default=14, ge=0, le=365)

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> Any:
        return _as_str(v)


async def send_invoice(ctx: ToolContext, args: SendInvoiceArgs) -> tuple[dict, str]:
    try:
        currency = check_currency(args.currency or ctx.default_currency)
        amount_minor = parse_amount(args.amount)
    except MoneyError as e:
        raise ToolError(str(e))
    _check_amount(ctx, amount_minor, currency)
    contact_id = _uuid(args.contact_id, "contact_id")
    due = ctx.today + timedelta(days=args.due_in_days)
    description = args.description.strip()

    async with ctx.pool.connection() as conn:
        contact = await _get_contact(conn, ctx, contact_id)
        cur = await conn.execute(
            """insert into invoices (owner_id, contact_id, description, amount_minor, currency, due_date, agent_run_id)
               values (%s, %s, %s, %s, %s, %s, %s) returning id""",
            (ctx.owner_id, contact_id, description, amount_minor, currency, due, ctx.run_id),
        )
        invoice_id = (await cur.fetchone())["id"]

    money = format_money(amount_minor, currency)
    try:
        sent = await ctx.adapter.create_and_send_invoice(
            reference=str(invoice_id), recipient_email=contact["email"], currency=currency,
            items=[InvoiceItem(name=description, quantity=1, unit_amount_minor=amount_minor)],
            recipient_name=contact["name"], due_date=due.isoformat(),
        )
    except PayPalError as e:
        async with ctx.pool.connection() as conn:
            await transition(
                conn, "invoices", invoice_id, "draft", "failed", actor="agent", event="invoice.failed",
                message=f"Invoice to {contact['name']} for {money} failed: {e.message}",
                set_fields={"error": f"{e.code}: {e.message}"},
            )
        raise ToolError(f"PayPal could not send the invoice ({e.code}): {e.message}")

    async with ctx.pool.connection() as conn:
        await transition(
            conn, "invoices", invoice_id, "draft", "sent", actor="agent", event="invoice.sent",
            message=f"Sent {contact['name']} a {money} invoice for {description}",
            set_fields={"paypal_invoice_id": sent.paypal_invoice_id, "paypal_status": sent.status, "sent_at": NOW},
        )
    result = {"invoice_id": str(invoice_id), "status": "sent", "contact": contact["name"],
              "amount": money, "currency": currency, "due_date": due.isoformat()}
    return result, f"Agent sent invoice: {money} to {contact['name']} for {description}"


# --- schedule_payout -----------------------------------------------------------

class SchedulePayoutArgs(BaseModel):
    trigger_invoice_id: str
    payee_contact_id: str
    split_percent: str | None = None
    amount: str | None = None

    @field_validator("split_percent", "amount", mode="before")
    @classmethod
    def _coerce(cls, v: Any) -> Any:
        return _as_str(v)


async def schedule_payout(ctx: ToolContext, args: SchedulePayoutArgs) -> tuple[dict, str]:
    if (args.split_percent is None) == (args.amount is None):
        raise ToolError("Give exactly one of split_percent or amount.")
    invoice_id = _uuid(args.trigger_invoice_id, "trigger_invoice_id")
    payee_id = _uuid(args.payee_contact_id, "payee_contact_id")

    async with ctx.pool.connection() as conn:
        async with conn.transaction():
            # Lock the invoice so a concurrent "paid" webhook waits and then sees this payout.
            cur = await conn.execute(
                "select id, amount_minor, currency, status from invoices where id = %s and owner_id = %s for update",
                (invoice_id, ctx.owner_id),
            )
            invoice = await cur.fetchone()
            if invoice is None:
                raise ToolError(f"No invoice with id {invoice_id}.")
            if invoice["status"] not in ("sent", "paid"):
                raise ToolError(f"That invoice is {invoice['status']}, so no payout can be scheduled on it.")
            payee = await _get_contact(conn, ctx, payee_id)
            if payee["role"] != "contractor":
                raise ToolError(f"{payee['name']} is a {payee['role']}; payouts can only go to contractors.")

            currency = invoice["currency"]
            percent_text = None
            try:
                if args.split_percent is not None:
                    hundredths = parse_percent_hundredths(args.split_percent)
                    if not 0 < hundredths <= 10_000:
                        raise ToolError("split_percent must be more than 0 and at most 100.")
                    amount_minor = split_amount(invoice["amount_minor"], hundredths)
                    percent_text = f"{hundredths // 100}.{hundredths % 100:02d}"
                else:
                    amount_minor = parse_amount(args.amount)
            except MoneyError as e:
                raise ToolError(str(e))
            _check_amount(ctx, amount_minor, currency)
            if amount_minor > invoice["amount_minor"]:
                raise ToolError("A payout cannot be larger than its invoice.")
            # Locked/approved/submitted/succeeded payouts are already committed to this invoice.
            # Without this check, several 100% payouts could each pass the per-payout test.
            already_committed = await active_payout_total(conn, invoice_id)
            if already_committed + amount_minor > invoice["amount_minor"]:
                raise ToolError(
                    f"This invoice already has {format_money(already_committed, currency)} committed in payouts; "
                    "a new payout would exceed the invoice total."
                )

            money = format_money(amount_minor, currency)
            if invoice["status"] == "paid":
                status, summary = "awaiting_approval", f"Payout {payee['name']} {money}"
            else:
                status, summary = "locked", f"Payout {payee['name']} {money} upon settlement"
            cur = await conn.execute(
                """insert into pending_actions (owner_id, type, status, trigger_invoice_id, payee_contact_id,
                       amount_minor, currency, split_percent, summary, idempotency_key, agent_run_id)
                   values (%s, 'payout', %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (ctx.owner_id, status, invoice_id, payee_id, amount_minor, currency, percent_text,
                 summary, f"payout-{uuid.uuid4().hex}", ctx.run_id),
            )
            action_id = (await cur.fetchone())["id"]
            await log_activity(
                conn, owner_id=ctx.owner_id, actor="agent",
                event="payout.scheduled" if status == "locked" else "payout.awaiting_approval",
                message=summary, entity_type="pending_action", entity_id=action_id,
                details={"invoice_id": str(invoice_id), "amount_minor": amount_minor, "currency": currency},
            )
    result = {"action_id": str(action_id), "status": status, "summary": summary, "amount": money,
              "payee": payee["name"], "needs_approval": True}
    return result, f"Agent scheduled payout: {summary}"


# --- list_invoices / list_pending_actions --------------------------------------

_INVOICE_STATUSES = ("draft", "sent", "paid", "cancelled", "failed", "overdue")
_ACTION_STATUSES = ("locked", "awaiting_approval", "executing", "submitted",
                    "succeeded", "failed", "rejected", "cancelled")


class ListInvoicesArgs(BaseModel):
    status: str | None = None


async def list_invoices(ctx: ToolContext, args: ListInvoicesArgs) -> tuple[dict, str]:
    status = (args.status or "").strip().lower() or None
    if status and status not in _INVOICE_STATUSES:
        raise ToolError(f"status must be one of {', '.join(_INVOICE_STATUSES)}")
    where, params = "i.owner_id = %s", [ctx.owner_id]
    if status == "overdue":
        where += " and i.status = 'sent' and i.due_date < %s"
        params.append(ctx.today)
    elif status:
        where += " and i.status = %s::invoice_status"
        params.append(status)
    async with ctx.pool.connection() as conn:
        cur = await conn.execute(
            f"""select i.id, i.description, i.amount_minor, i.currency, i.status, i.due_date, c.name as contact
                from invoices i join contacts c on c.id = i.contact_id and c.owner_id = i.owner_id
                where {where} order by i.created_at desc limit 50""",
            params,
        )
        rows = await cur.fetchall()
    out = [{
        "invoice_id": str(r["id"]), "contact": r["contact"], "description": r["description"],
        "amount": format_money(r["amount_minor"], r["currency"]), "status": r["status"],
        "due_date": r["due_date"].isoformat() if r["due_date"] else None,
        "overdue": r["status"] == "sent" and r["due_date"] is not None and r["due_date"] < ctx.today,
    } for r in rows]
    return {"invoices": out, "count": len(out)}, f"Listed {len(out)} invoice(s)" + (f" ({status})" if status else "")


class ListPendingActionsArgs(BaseModel):
    status: str | None = None


async def list_pending_actions(ctx: ToolContext, args: ListPendingActionsArgs) -> tuple[dict, str]:
    status = (args.status or "").strip().lower() or None
    if status and status not in _ACTION_STATUSES:
        raise ToolError(f"status must be one of {', '.join(_ACTION_STATUSES)}")
    where, params = "owner_id = %s", [ctx.owner_id]
    if status:
        where += " and status = %s::action_status"
        params.append(status)
    async with ctx.pool.connection() as conn:
        cur = await conn.execute(
            f"""select id, type, status, summary, trigger_invoice_id from pending_actions
                where {where} order by created_at desc limit 50""",
            params,
        )
        rows = await cur.fetchall()
    out = [{"action_id": str(r["id"]), "type": r["type"], "status": r["status"], "summary": r["summary"],
            "trigger_invoice_id": str(r["trigger_invoice_id"]) if r["trigger_invoice_id"] else None} for r in rows]
    return {"actions": out, "count": len(out)}, f"Listed {len(out)} pending action(s)" + (f" ({status})" if status else "")


# --- registry ------------------------------------------------------------------

@dataclass
class Tool:
    spec: ToolSpec
    args_model: type[BaseModel]
    handler: Callable[[ToolContext, Any], Awaitable[tuple[dict, str]]]


def _obj(properties: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": properties, "required": required,
            "additionalProperties": False}


TOOLS: dict[str, Tool] = {t.spec.name: t for t in [
    Tool(ToolSpec("find_contact", "Find the user's contacts whose name, email or alias matches the query. "
                  "Returns 0, 1 or several matches.",
                  _obj({"query": {"type": "string", "description": "A name, email or alias such as 'my editor'"}},
                       ["query"])),
         FindContactArgs, find_contact),
    Tool(ToolSpec("create_contact", "Create a contact. Only when the user typed the email in this message.",
                  _obj({"name": {"type": "string"},
                        "email": {"type": "string"},
                        "role": {"type": "string", "enum": ["client", "contractor"]},
                        "aliases": {"type": "array", "items": {"type": "string"}}},
                       ["name", "email", "role"])),
         CreateContactArgs, create_contact),
    Tool(ToolSpec("send_invoice", "Create and send a PayPal invoice to a contact right away.",
                  _obj({"contact_id": {"type": "string"},
                        "description": {"type": "string"},
                        "amount": {"type": "string", "description": "Decimal string, e.g. '1200.00'"},
                        "currency": {"type": "string", "enum": list(ALLOWED_CURRENCIES)},
                        "due_in_days": {"type": "integer", "description": "Days until due. Default 14."}},
                       ["contact_id", "description", "amount", "currency"])),
         SendInvoiceArgs, send_invoice),
    Tool(ToolSpec("schedule_payout", "Queue a payout to a contractor that unlocks when the trigger invoice is paid "
                  "and then needs the user's approval on the dashboard. Give split_percent or amount, not both.",
                  _obj({"trigger_invoice_id": {"type": "string"},
                        "payee_contact_id": {"type": "string"},
                        "split_percent": {"type": "number", "description": "Percent of the invoice, e.g. 20"},
                        "amount": {"type": "string", "description": "Fixed amount as a decimal string"}},
                       ["trigger_invoice_id", "payee_contact_id"])),
         SchedulePayoutArgs, schedule_payout),
    Tool(ToolSpec("list_invoices", "List the user's invoices, optionally by status.",
                  _obj({"status": {"type": "string", "enum": list(_INVOICE_STATUSES)}}, [])),
         ListInvoicesArgs, list_invoices),
    Tool(ToolSpec("list_pending_actions", "List the user's pending actions (payouts, reminders), optionally by status.",
                  _obj({"status": {"type": "string", "enum": list(_ACTION_STATUSES)}}, [])),
         ListPendingActionsArgs, list_pending_actions),
]}

TOOL_SPECS: list[ToolSpec] = [t.spec for t in TOOLS.values()]


async def execute_tool(ctx: ToolContext, name: str, raw_args: dict) -> dict:
    """Validate, run, and log one tool call. Never raises for user-facing problems."""
    tool = TOOLS.get(name)
    try:
        if tool is None:
            raise ToolError(f"Unknown tool {name!r}.")
        try:
            args = tool.args_model.model_validate(raw_args or {})
        except ValidationError as e:
            first = e.errors()[0]
            raise ToolError(f"Invalid argument {'.'.join(map(str, first['loc']))}: {first['msg']}")
        result, message = await tool.handler(ctx, args)
        event = f"agent.{name}"
    except ToolError as e:
        result, message, event = {"error": str(e)}, f"Agent {name} failed: {e}", f"agent.{name}.error"

    async with ctx.pool.connection() as conn:
        await log_activity(conn, owner_id=ctx.owner_id, actor="agent", event=event, message=message,
                           entity_type="agent_run", entity_id=ctx.run_id,
                           details={"tool": name, "args": raw_args, "result": result})
    return result
