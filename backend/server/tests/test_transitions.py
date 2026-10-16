import uuid

import pytest

from app.transitions import ACTION_TRANSITIONS, INVOICE_TRANSITIONS, transition
from tests.conftest import fetchall, fetchone


async def make_invoice(pool, user, status="draft"):
    async with pool.connection() as conn:
        cur = await conn.execute(
            """insert into invoices (owner_id, contact_id, description, amount_minor, currency, status)
               values (%s, %s, 'Work', 120000, 'USD', %s) returning id""",
            (user["id"], user["john"], status),
        )
        return (await cur.fetchone())["id"]


async def make_action(pool, user, type_, status, invoice_id=None):
    async with pool.connection() as conn:
        cur = await conn.execute(
            """insert into pending_actions (owner_id, type, status, trigger_invoice_id, payee_contact_id,
                   amount_minor, currency, summary, idempotency_key)
               values (%s, %s, %s, %s, %s, 24000, 'USD', 'Payout Sarah $240.00', %s) returning id""",
            (user["id"], type_, status, invoice_id, user["sarah"], uuid.uuid4().hex),
        )
        return (await cur.fetchone())["id"]


@pytest.mark.parametrize("frm,to", sorted(INVOICE_TRANSITIONS))
async def test_invoice_transitions(pool, user, frm, to):
    inv = await make_invoice(pool, user, frm)
    async with pool.connection() as conn:
        row = await transition(conn, "invoices", inv, frm, to, actor="system", event="t", message="moved")
    assert row["status"] == to
    log = await fetchall(pool, "select * from activity_log where entity_id = %s", inv)
    assert len(log) == 1 and log[0]["details"] == {"from": frm, "to": to}


@pytest.mark.parametrize("pair,types", sorted(ACTION_TRANSITIONS.items()))
async def test_action_transitions(pool, user, pair, types):
    frm, to = pair
    for t in ("payout", "invoice_reminder"):
        act = await make_action(pool, user, t, frm)
        async with pool.connection() as conn:
            row = await transition(conn, "pending_actions", act, frm, to, actor="system", event="t", message="m")
        if t in types:
            assert row is not None and row["status"] == to
        else:
            assert row is None, f"{t} must not move {frm} -> {to}"
            assert (await fetchone(pool, "select status from pending_actions where id = %s", act))["status"] == frm


async def test_lost_race_returns_none_and_logs_nothing(pool, user):
    inv = await make_invoice(pool, user, "sent")
    async with pool.connection() as conn:
        assert await transition(conn, "invoices", inv, "draft", "sent", actor="system", event="t", message="m") is None
    assert await fetchall(pool, "select * from activity_log") == []


async def test_owner_filter(pool, user, other_user):
    act = await make_action(pool, user, "payout", "awaiting_approval")
    async with pool.connection() as conn:
        assert await transition(conn, "pending_actions", act, "awaiting_approval", "rejected", actor="user",
                                event="t", message="m", owner_id=other_user["id"]) is None


async def test_illegal_transitions_raise(pool, user):
    inv = await make_invoice(pool, user, "paid")
    async with pool.connection() as conn:
        with pytest.raises(ValueError):
            await transition(conn, "invoices", inv, "paid", "sent", actor="system", event="t", message="m")
        with pytest.raises(ValueError):
            await transition(conn, "pending_actions", inv, "succeeded", "executing", actor="system", event="t", message="m")
        with pytest.raises(ValueError):
            await transition(conn, "invoices", inv, "draft", "sent", actor="system", event="t", message="m",
                             set_fields={"amount_minor": 1})
