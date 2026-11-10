from tests.conftest import fetchall, fetchone
from tests.helpers import deliver, event, sent_invoice_with_payout, status


async def test_paid_unlocks_payout_and_cancels_reminder(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user, with_reminder=True)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    r = await deliver(client, event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}))
    assert r.status_code == 200
    inv = await fetchone(pool, "select * from invoices where id = %s", s["invoice_id"])
    assert inv["status"] == "paid" and inv["paid_at"] is not None and inv["paypal_status"] == "PAID"
    payout = await fetchone(pool, "select * from pending_actions where id = %s", s["payout_id"])
    assert payout["status"] == "awaiting_approval" and payout["summary"] == "Payout Sarah $240.00"
    assert await status(pool, "pending_actions", s["reminder_id"]) == "cancelled"
    events = {r["event"] for r in await fetchall(pool, "select event from activity_log where actor = 'paypal'")}
    assert {"invoice.paid", "payout.unlocked", "reminder.cancelled"} <= events


async def test_partial_payment_changes_nothing(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PARTIALLY_PAID", amount_paid_minor=50000)
    r = await deliver(client, event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}))
    assert r.status_code == 200
    assert await status(pool, "invoices", s["invoice_id"]) == "sent"
    assert await status(pool, "pending_actions", s["payout_id"]) == "locked"
    assert (await fetchone(pool, "select event from activity_log"))["event"] == "invoice.payment_partial"


async def test_duplicate_delivery_is_ignored(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    ev = event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}, event_id="WH-dup")
    assert (await deliver(client, ev)).status_code == 200
    before = await fetchall(pool, "select * from activity_log order by id")
    calls_before = len(adapter.calls)
    assert (await deliver(client, ev)).status_code == 200
    assert await fetchall(pool, "select * from activity_log order by id") == before
    assert len(adapter.calls) == calls_before
    assert len(await fetchall(pool, "select * from webhook_events")) == 1


async def test_bad_signature(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    r = await deliver(client, event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}), signature="forged")
    assert r.status_code == 400
    assert await status(pool, "invoices", s["invoice_id"]) == "sent"
    assert await fetchall(pool, "select * from webhook_events") == []


async def test_cancelled(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user, with_reminder=True)
    r = await deliver(client, event("INVOICING.INVOICE.CANCELLED", {"id": s["paypal_invoice_id"]}))
    assert r.status_code == 200
    assert await status(pool, "invoices", s["invoice_id"]) == "cancelled"
    assert await status(pool, "pending_actions", s["payout_id"]) == "cancelled"
    assert await status(pool, "pending_actions", s["reminder_id"]) == "cancelled"


async def submitted_payout(pool, adapter, user):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        cur = await conn.execute(
            """update pending_actions set status = 'submitted', paypal_payout_batch_id = 'BATCH1'
               where id = %s returning idempotency_key""", (s["payout_id"],))
        s["key"] = (await cur.fetchone())["idempotency_key"]
    return s


async def test_payout_success_and_denied(client, pool, user, adapter):
    s = await submitted_payout(pool, adapter, user)
    r = await deliver(client, event("PAYMENT.PAYOUTSBATCH.SUCCESS", {"batch_header": {"payout_batch_id": "BATCH1"}}))
    assert r.status_code == 200
    assert await status(pool, "pending_actions", s["payout_id"]) == "succeeded"

    s2 = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        await conn.execute("update pending_actions set status = 'submitted', paypal_payout_batch_id = 'BATCH2' where id = %s",
                           (s2["payout_id"],))
    r = await deliver(client, event("PAYMENT.PAYOUTSBATCH.DENIED", {"batch_header": {"payout_batch_id": "BATCH2"}}))
    assert r.status_code == 200
    row = await fetchone(pool, "select * from pending_actions where id = %s", s2["payout_id"])
    assert row["status"] == "failed" and "denied" in row["error"]


async def test_batch_webhook_before_submit_is_retried(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        cur = await conn.execute("update pending_actions set status = 'executing' where id = %s returning idempotency_key",
                                 (s["payout_id"],))
        key = (await cur.fetchone())["idempotency_key"]
    ev = event("PAYMENT.PAYOUTSBATCH.SUCCESS",
               {"batch_header": {"payout_batch_id": "B9", "sender_batch_header": {"sender_batch_id": key}}})
    assert (await deliver(client, ev)).status_code == 500
    assert (await fetchone(pool, "select processed_at from webhook_events"))["processed_at"] is None
    async with pool.connection() as conn:
        await conn.execute("update pending_actions set status = 'submitted', paypal_payout_batch_id = 'B9' where id = %s",
                           (s["payout_id"],))
    assert (await deliver(client, ev)).status_code == 200  # PayPal's redelivery
    assert await status(pool, "pending_actions", s["payout_id"]) == "succeeded"


async def test_refund_cancels_payouts_not_yet_sent(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    await deliver(client, event("INVOICING.INVOICE.PAID", {"id": s["paypal_invoice_id"]}))
    assert await status(pool, "pending_actions", s["payout_id"]) == "awaiting_approval"
    sent = await submitted_payout(pool, adapter, user)  # a payout already with PayPal can't be recalled

    r = await deliver(client, event("INVOICING.INVOICE.REFUNDED", {"id": s["paypal_invoice_id"], "status": "REFUNDED"}))
    assert r.status_code == 200
    assert await status(pool, "pending_actions", s["payout_id"]) == "cancelled"
    assert await status(pool, "invoices", s["invoice_id"]) == "paid"
    assert await status(pool, "pending_actions", sent["payout_id"]) == "submitted"
    events = {r["event"] for r in await fetchall(pool, "select event from activity_log where actor = 'paypal'")}
    assert {"invoice.refunded", "payout.cancelled"} <= events
    # Approving the cancelled payout is refused, and nothing reaches PayPal.
    from tests.conftest import auth
    r = await client.post(f"/api/actions/{s['payout_id']}/approve", headers=auth(user))
    assert r.status_code == 409 and adapter.payouts == {}


def item_event(kind, key, batch="BATCH1"):
    return event(f"PAYMENT.PAYOUTS-ITEM.{kind}", {
        "payout_item_id": "ITEM1", "transaction_status": kind, "payout_batch_id": batch,
        "payout_item": {"sender_item_id": key, "receiver": "sarah@example.com"},
    })


async def test_unclaimed_payout_item_marks_payout_failed(client, pool, user, adapter):
    s = await submitted_payout(pool, adapter, user)
    r = await deliver(client, item_event("UNCLAIMED", s["key"]))
    assert r.status_code == 200
    row = await fetchone(pool, "select * from pending_actions where id = %s", s["payout_id"])
    assert row["status"] == "failed" and "UNCLAIMED" in row["error"]
    # A batch SUCCESS arriving afterwards doesn't turn it back into a success.
    await deliver(client, event("PAYMENT.PAYOUTSBATCH.SUCCESS", {"batch_header": {"payout_batch_id": "BATCH1"}}))
    assert await status(pool, "pending_actions", s["payout_id"]) == "failed"


async def test_payout_item_problem_after_success_is_logged(client, pool, user, adapter):
    s = await submitted_payout(pool, adapter, user)
    await deliver(client, event("PAYMENT.PAYOUTSBATCH.SUCCESS", {"batch_header": {"payout_batch_id": "BATCH1"}}))
    r = await deliver(client, item_event("RETURNED", s["key"]))
    assert r.status_code == 200
    assert await status(pool, "pending_actions", s["payout_id"]) == "succeeded"
    log = await fetchone(pool, "select * from activity_log where event = 'payout.item_problem'")
    assert log is not None and "RETURNED" in log["message"]


async def test_payout_item_before_submit_is_retried_and_success_item_ignored(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        cur = await conn.execute("update pending_actions set status = 'executing' where id = %s returning idempotency_key",
                                 (s["payout_id"],))
        key = (await cur.fetchone())["idempotency_key"]
    assert (await deliver(client, item_event("UNCLAIMED", key, batch="B7"))).status_code == 500
    assert (await deliver(client, item_event("SUCCEEDED", key, batch="B7"))).status_code == 200
    assert await status(pool, "pending_actions", s["payout_id"]) == "executing"


async def test_unknown_and_other_events(client, pool):
    r = await deliver(client, event("INVOICING.INVOICE.PAID", {"id": "INV2-NOPE"}))
    assert r.status_code == 200
    r = await deliver(client, event("CUSTOMER.DISPUTE.CREATED", {"id": "X"}))
    assert r.status_code == 200
    rows = await fetchall(pool, "select * from webhook_events order by received_at")
    assert all(r["processed_at"] for r in rows)
    assert rows[0]["error"] == "unknown invoice INV2-NOPE"


async def test_malformed_body(client):
    r = await client.post("/webhooks/paypal", content=b"not json", headers={"paypal-transmission-sig": "mock-valid-signature"})
    assert r.status_code == 400


async def test_dev_simulate_paid(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    r = await client.post(f"/dev/simulate-paid/{s['invoice_id']}")
    assert r.status_code == 200 and r.json()["invoice"]["status"] == "paid"
    assert await status(pool, "pending_actions", s["payout_id"]) == "awaiting_approval"
    assert (await client.post(f"/dev/simulate-paid/{s['invoice_id']}")).status_code == 409


def paypal_invoice_event(event_type, paypal_invoice_id, status):
    """The real shape of PayPal's v2 invoicing webhooks: the invoice is nested under resource.invoice."""
    return event(event_type, {"invoice": {
        "id": paypal_invoice_id, "status": status,
        "detail": {"currency_code": "USD", "reference": "ref"},
        "payments": {"paid_amount": {"currency_code": "USD", "value": "1200.00"}},
    }})


async def test_real_paypal_payload_shape_paid_and_refunded(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    adapter.set_invoice_status(s["paypal_invoice_id"], "PAID")
    r = await deliver(client, paypal_invoice_event("INVOICING.INVOICE.PAID", s["paypal_invoice_id"], "PAID"))
    assert r.status_code == 200
    assert await status(pool, "invoices", s["invoice_id"]) == "paid"
    assert await status(pool, "pending_actions", s["payout_id"]) == "awaiting_approval"
    row = await fetchone(pool, "select resource_id, error from webhook_events")
    assert row == {"resource_id": s["paypal_invoice_id"], "error": None}

    r = await deliver(client, paypal_invoice_event("INVOICING.INVOICE.REFUNDED", s["paypal_invoice_id"], "REFUNDED"))
    assert r.status_code == 200
    assert await status(pool, "pending_actions", s["payout_id"]) == "cancelled"


async def test_real_paypal_payload_shape_cancelled(client, pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    r = await deliver(client, paypal_invoice_event("INVOICING.INVOICE.CANCELLED", s["paypal_invoice_id"], "CANCELLED"))
    assert r.status_code == 200
    assert await status(pool, "invoices", s["invoice_id"]) == "cancelled"
    assert await status(pool, "pending_actions", s["payout_id"]) == "cancelled"
