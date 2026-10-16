import asyncio

from app.paypal_contract import PayPalError
from tests.conftest import auth, fetchall, fetchone
from tests.helpers import sent_invoice_with_payout, status


async def awaiting_payout(pool, adapter, user):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        await conn.execute("update pending_actions set status = 'awaiting_approval' where id = %s", (s["payout_id"],))
    return s


async def test_approve_payout(client, pool, user, adapter):
    s = await awaiting_payout(pool, adapter, user)
    r = await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))
    assert r.status_code == 200, r.text
    action = r.json()["action"]
    assert action["status"] == "submitted" and action["paypal_payout_batch_id"].startswith("MOCKBATCH")
    assert action["decided_at"] and action["executed_at"]
    [payout] = adapter.payouts.values()
    assert payout == {**payout, "recipient_email": "sarah@example.com", "amount_minor": 24000, "currency": "USD"}
    msgs = [r["message"] for r in await fetchall(pool, "select message from activity_log where actor = 'user'")]
    assert msgs == ["Kwame approved: Payout Sarah $240.00 upon settlement"]


async def test_two_simultaneous_approves_send_one_payout(client, pool, user, adapter):
    adapter.delay_seconds = 0.05
    s = await awaiting_payout(pool, adapter, user)
    url = f"/api/actions/{s['payout_id']}/approve"
    r1, r2 = await asyncio.gather(client.post(url, headers=auth(user)), client.post(url, headers=auth(user)))
    assert sorted([r1.status_code, r2.status_code]) == [200, 409]
    assert len(adapter.payouts) == 1
    assert [c[0] for c in adapter.calls].count("execute_payout") == 1


async def test_cannot_approve_locked_or_twice(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    r = await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))
    assert r.status_code == 409 and r.json()["error"]["code"] == "conflict"
    assert adapter.payouts == {}


async def test_other_user_cannot_act(client, pool, user, other_user, adapter):
    s = await awaiting_payout(pool, adapter, user)
    for verb in ("approve", "reject"):
        r = await client.post(f"/api/actions/{s['payout_id']}/{verb}", headers=auth(other_user))
        assert r.status_code == 404
    assert await status(pool, "pending_actions", s["payout_id"]) == "awaiting_approval"


async def test_reject(client, pool, user, adapter):
    s = await awaiting_payout(pool, adapter, user)
    r = await client.post(f"/api/actions/{s['payout_id']}/reject", json={"reason": "wrong amount"}, headers=auth(user))
    assert r.status_code == 200 and r.json()["action"]["status"] == "rejected"
    assert (await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))).status_code == 409
    assert adapter.payouts == {}


async def test_payout_error_marks_failed(client, pool, user, adapter):
    s = await awaiting_payout(pool, adapter, user)
    adapter.fail_next("execute_payout", PayPalError("INSUFFICIENT_FUNDS", "Not enough balance"))
    r = await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))
    action = r.json()["action"]
    assert action["status"] == "failed" and "INSUFFICIENT_FUNDS" in action["error"]


async def test_approve_reminder_with_edit(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user, with_reminder=True)
    r = await client.post(f"/api/actions/{s['reminder_id']}/approve", json={"message": "Hi John, gentle nudge."},
                          headers=auth(user))
    assert r.status_code == 200 and r.json()["action"]["status"] == "succeeded"
    assert adapter.reminders == [(s["paypal_invoice_id"], "Hi John, gentle nudge.")]
    inv = await fetchone(pool, "select last_reminder_at from invoices where id = %s", s["invoice_id"])
    assert inv["last_reminder_at"] is not None


async def test_reminder_failure(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user, with_reminder=True)
    adapter.fail_next("send_invoice_reminder", PayPalError("INVOICE_PAID", "Already paid"))
    r = await client.post(f"/api/actions/{s['reminder_id']}/approve", headers=auth(user))
    assert r.json()["action"]["status"] == "failed"
    assert (await fetchone(pool, "select last_reminder_at from invoices"))["last_reminder_at"] is None


async def test_full_flow_through_webhooks(client, pool, user, adapter):
    """Pay -> unlock -> approve -> batch success."""
    from tests.helpers import deliver, event

    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    await deliver(client, event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}))
    action = (await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))).json()["action"]
    await deliver(client, event("PAYMENT.PAYOUTSBATCH.SUCCESS",
                                {"batch_header": {"payout_batch_id": action["paypal_payout_batch_id"]}}))
    assert await status(pool, "pending_actions", s["payout_id"]) == "succeeded"


async def test_create_contact_endpoint(client, pool, user):
    body = {"name": "Mary", "email": "mary@example.com", "role": "client"}
    r = await client.post("/api/contacts", json=body, headers=auth(user))
    assert r.status_code == 201 and r.json()["contact"]["name"] == "Mary"
    assert (await client.post("/api/contacts", json=body, headers=auth(user))).status_code == 409
    r = await client.post("/api/contacts", json={**body, "role": "boss"}, headers=auth(user))
    assert r.status_code == 422


async def test_health(client):
    assert (await client.get("/health")).json() == {"ok": True}
