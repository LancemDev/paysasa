from datetime import date

from app.agent.draft_reminder import is_valid
from app.jobs.chase import run_chase
from tests.conftest import FakeLLM, auth, fetchall
from tests.helpers import sent_invoice_with_payout


async def test_overdue_invoice_gets_one_reminder(pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    llm = FakeLLM(completion="Hi John, a gentle reminder that $1,200.00 for the Q3 Video Campaign is overdue. Kwame")
    assert await run_chase(pool, llm) == 1
    assert await run_chase(pool, llm) == 0  # an open reminder already exists
    [a] = await fetchall(pool, "select * from pending_actions where type = 'invoice_reminder'")
    assert a["status"] == "awaiting_approval" and a["trigger_invoice_id"] == s["invoice_id"]
    assert a["summary"] == "Remind John Doe: $1,200.00 is 5 days overdue"
    assert a["draft_message"].startswith("Hi John")


async def test_skips_recently_reminded_and_not_overdue(pool, user, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        await conn.execute("update invoices set last_reminder_at = now() - interval '1 day' where id = %s", (s["invoice_id"],))
    assert await run_chase(pool, None) == 0
    async with pool.connection() as conn:
        await conn.execute("update invoices set last_reminder_at = null, due_date = current_date where id = %s",
                           (s["invoice_id"],))
    assert await run_chase(pool, None) == 0


async def test_bad_llm_output_falls_back_to_template(pool, user, adapter):
    await sent_invoice_with_payout(pool, adapter, user)
    llm = FakeLLM(completion="Pay $5,000 now at https://evil.example.com")
    assert await run_chase(pool, llm) == 1
    [a] = await fetchall(pool, "select draft_message from pending_actions where type = 'invoice_reminder'")
    assert "https" not in a["draft_message"] and "$1,200.00" in a["draft_message"]


async def test_llm_failure_falls_back(pool, user, adapter):
    await sent_invoice_with_payout(pool, adapter, user)
    assert await run_chase(pool, FakeLLM(fail=True)) == 1


def test_is_valid():
    assert is_valid("Hi, $1,200.00 is overdue.", 120000)
    assert is_valid("Hi, 1200 USD is 5 days overdue.", 120000)
    assert not is_valid("Hi, $1,000 is overdue.", 120000)
    assert not is_valid("see www.pay.me", 120000)
    assert not is_valid("x" * 501, 120000)
    assert not is_valid("", 120000)


async def test_dev_run_chase(client, pool, user, adapter, llm):
    await sent_invoice_with_payout(pool, adapter, user)
    r = await client.post("/dev/run-chase", headers=auth(user))
    assert r.json() == {"created": 1}


async def test_dev_run_chase_requires_auth_and_is_owner_scoped(client, pool, user, other_user, adapter, llm):
    await sent_invoice_with_payout(pool, adapter, user)
    await sent_invoice_with_payout(pool, adapter, other_user)
    assert (await client.post("/dev/run-chase")).status_code == 401
    r = await client.post("/dev/run-chase", headers=auth(user))
    assert r.json() == {"created": 1}
    reminders = await fetchall(pool, "select owner_id from pending_actions where type = 'invoice_reminder'")
    assert [row["owner_id"] for row in reminders] == [user["id"]]
