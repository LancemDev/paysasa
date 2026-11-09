from app.agent.tools import TOOLS
from app.paypal_contract import PayPalError
from tests.conftest import auth, call, fetchall, fetchone, reply, result_of, turn_calls
from tests.helpers import sent_invoice_with_payout

DEMO = ("Send an invoice to John Doe (john@example.com) for $1,200 for the Q3 Video Campaign. "
        "Once paid, schedule a payout of 20% to my editor, Sarah.")


def demo_script(user):
    def after_find_john(results):
        john = result_of(results, "find_contact")["matches"][0]
        return turn_calls(call("send_invoice", contact_id=john["contact_id"], description="Q3 Video Campaign",
                               amount="1200.00", currency="USD"))

    state = {}

    def after_send(results):
        state["invoice_id"] = result_of(results, "send_invoice")["invoice_id"]
        return turn_calls(call("find_contact", query="my editor"))

    def after_find_sarah(results):
        sarah = result_of(results, "find_contact")["matches"][0]
        return turn_calls(call("schedule_payout", trigger_invoice_id=state["invoice_id"],
                               payee_contact_id=sarah["contact_id"], split_percent=20))

    return [
        turn_calls(call("find_contact", query="John Doe")),
        after_find_john, after_send, after_find_sarah,
        lambda results: reply("Sent John Doe a $1,200.00 invoice for the Q3 Video Campaign. Sarah's $240.00 "
                              "payout is locked until John pays, then it needs your approval."),
    ]


async def test_worked_example(client, pool, user, llm, adapter):
    llm.steps = demo_script(user)
    r = await client.post("/api/agent/message", json={"message": DEMO}, headers=auth(user))
    assert r.status_code == 200, r.text
    body = r.json()
    assert "John Doe" in body["reply"] and "$240.00" in body["reply"]

    invoices = await fetchall(pool, "select * from invoices")
    assert len(invoices) == 1
    inv = invoices[0]
    assert (inv["status"], inv["amount_minor"], inv["currency"]) == ("sent", 120000, "USD")
    assert inv["paypal_invoice_id"].startswith("INV2-MOCK") and inv["sent_at"] is not None

    actions = await fetchall(pool, "select * from pending_actions")
    assert len(actions) == 1
    a = actions[0]
    assert (a["type"], a["status"], a["amount_minor"], a["payee_contact_id"]) == ("payout", "locked", 24000, user["sarah"])
    assert a["summary"] == "Payout Sarah $240.00 upon settlement"
    assert [c[0] for c in adapter.calls] == ["create_and_send_invoice"]  # no payout call

    run = await fetchone(pool, "select * from agent_runs where id = %s", body["run_id"])
    assert run["status"] == "completed" and len(run["tool_calls"]) == 4
    events = [r["event"] for r in await fetchall(pool, "select event from activity_log where actor = 'agent'")]
    assert events.count("agent.find_contact") == 2
    assert "agent.send_invoice" in events and "agent.schedule_payout" in events and "invoice.sent" in events

    runs = (await client.get("/api/agent/runs", headers=auth(user))).json()
    assert runs[0]["id"] == body["run_id"]


async def test_context_and_history(client, pool, user, llm):
    llm.steps = [reply("Hi")]
    await client.post("/api/agent/message", json={"message": "hello"}, headers=auth(user))
    llm.steps = [reply("Again")]
    await client.post("/api/agent/message", json={"message": "again"}, headers=auth(user))
    assert llm.history == [("hello", "Hi")]
    assert "Sarah <sarah@example.com> (contractor; aliases: my editor)" in llm.systems[-1]
    assert "default currency is USD" in llm.systems[-1]


async def test_unknown_recipient_without_email_creates_nothing(client, pool, user, llm):
    llm.steps = [
        turn_calls(call("find_contact", query="Mary")),
        # Even if the model tries to invent an email, the handler refuses.
        lambda results: turn_calls(call("create_contact", name="Mary", email="mary@example.com", role="client")),
        lambda results: reply("What is Mary's email address?"),
    ]
    r = await client.post("/api/agent/message", json={"message": "Invoice Mary $50 for logo work"}, headers=auth(user))
    assert r.json()["reply"] == "What is Mary's email address?"
    assert "error" in llm.received[2][0].result
    assert await fetchall(pool, "select * from invoices") == []
    assert len(await fetchall(pool, "select * from contacts where owner_id = %s", user["id"])) == 2


async def test_create_contact_with_email_in_message(client, pool, user, llm):
    msg = "Invoice Mary (mary@example.com) $50"
    llm.steps = [turn_calls(call("create_contact", name="Mary", email="mary@example.com", role="client")),
                 lambda results: reply("ok")]
    await client.post("/api/agent/message", json={"message": msg}, headers=auth(user))
    assert llm.received[1][0].result["contact"]["email"] == "mary@example.com"


async def test_unsupported_currency_is_refused(client, pool, user, llm):
    llm.steps = [
        turn_calls(call("send_invoice", contact_id=str(user["john"]), description="Work", amount="5000", currency="XYZ")),
        lambda results: reply("That currency isn't supported. I can invoice in KES, USD, EUR, GBP, CAD, AUD, or CHF."),
    ]
    r = await client.post("/api/agent/message", json={"message": "Invoice John 5000 XYZ"}, headers=auth(user))
    err = llm.received[1][0].result["error"]
    assert "KES" in err
    assert "KES" in r.json()["reply"] or "currency" in r.json()["reply"].lower()
    assert await fetchall(pool, "select * from invoices") == []
    assert "Supported currencies are KES, USD, EUR, GBP, CAD, AUD, CHF" in llm.systems[0]


async def run_tool(client, user, llm, name, /, **args):
    llm.steps = [turn_calls(call(name, **args)), lambda results: reply("done")]
    await client.post("/api/agent/message", json={"message": "x"}, headers=auth(user))
    return llm.received[-1][0].result


async def make_sent_invoice(client, user, llm, amount="1200.00"):
    res = await run_tool(client, user, llm, "send_invoice", contact_id=str(user["john"]), description="Work",
                         amount=amount, currency="USD")
    return res["invoice_id"]


async def test_guardrails(client, pool, user, other_user, llm, adapter):
    # Amount limits
    res = await run_tool(client, user, llm, "send_invoice", contact_id=str(user["john"]), description="Big",
                         amount="10000.01", currency="USD")
    assert "limit" in res["error"]
    res = await run_tool(client, user, llm, "send_invoice", contact_id=str(user["john"]), description="Zero",
                         amount="0", currency="USD")
    assert "greater than zero" in res["error"]
    # Someone else's contact
    res = await run_tool(client, user, llm, "send_invoice", contact_id=str(other_user["john"]), description="X",
                         amount="10", currency="USD")
    assert "No contact" in res["error"]

    inv = await make_sent_invoice(client, user, llm)
    # Payee must be a contractor
    res = await run_tool(client, user, llm, "schedule_payout", trigger_invoice_id=inv,
                         payee_contact_id=str(user["john"]), split_percent=20)
    assert "contractors" in res["error"]
    # Percent bounds, payout cannot exceed invoice, exactly one of amount/percent
    for kwargs, msg in [({"split_percent": 0}, "more than 0"), ({"split_percent": 101}, "at most 100"),
                        ({"amount": "1200.01"}, "larger than its invoice"),
                        ({"amount": "10", "split_percent": 5}, "exactly one"), ({}, "exactly one")]:
        res = await run_tool(client, user, llm, "schedule_payout", trigger_invoice_id=inv,
                             payee_contact_id=str(user["sarah"]), **kwargs)
        assert msg in res["error"], (kwargs, res)
    # Another user cannot schedule against this invoice
    res = await run_tool(client, other_user, llm, "schedule_payout", trigger_invoice_id=inv,
                         payee_contact_id=str(other_user["sarah"]), split_percent=20)
    assert "No invoice" in res["error"]
    # Invalid args are reported, not raised
    res = await run_tool(client, user, llm, "send_invoice", description="no contact")
    assert res["error"].startswith("Invalid argument")
    assert await fetchall(pool, "select * from pending_actions") == []
    errors = await fetchall(pool, "select * from activity_log where event like 'agent.%%.error'")
    assert len(errors) == 11


async def test_fixed_amount_payout_and_already_paid(client, pool, user, llm):
    inv = await make_sent_invoice(client, user, llm)
    async with pool.connection() as conn:
        await conn.execute("update invoices set status = 'paid' where id = %s", (inv,))
    res = await run_tool(client, user, llm, "schedule_payout", trigger_invoice_id=inv,
                         payee_contact_id=str(user["sarah"]), amount="100.50")
    assert res["status"] == "awaiting_approval" and res["summary"] == "Payout Sarah $100.50"


async def test_paypal_failure_marks_invoice_failed(client, pool, user, llm, adapter):
    adapter.fail_next("create_and_send_invoice", PayPalError("INVALID_REQUEST", "bad email"))
    res = await run_tool(client, user, llm, "send_invoice", contact_id=str(user["john"]), description="Work",
                         amount="10", currency="USD")
    assert "bad email" in res["error"]
    inv = await fetchone(pool, "select * from invoices")
    assert inv["status"] == "failed" and "bad email" in inv["error"]


async def test_find_contact_partial_and_ambiguous(client, pool, user, llm):
    async with pool.connection() as conn:
        await conn.execute("insert into contacts (owner_id, name, email, role) values (%s, 'John Smith', 'js@x.com', 'client')",
                           (user["id"],))
    res = await run_tool(client, user, llm, "find_contact", query="john")
    assert res["count"] == 2
    res = await run_tool(client, user, llm, "find_contact", query="editor")
    assert [m["name"] for m in res["matches"]] == ["Sarah"]
    res = await run_tool(client, user, llm, "find_contact", query="100%")
    assert res["count"] == 0


async def test_list_tools(client, user, llm):
    await make_sent_invoice(client, user, llm)
    res = await run_tool(client, user, llm, "list_invoices", status="sent")
    assert res["count"] == 1 and res["invoices"][0]["amount"] == "$1,200.00"
    res = await run_tool(client, user, llm, "list_pending_actions")
    assert res["count"] == 0
    res = await run_tool(client, user, llm, "list_invoices", status="bogus")
    assert "error" in res


async def test_round_limit(client, pool, user, llm):
    llm.steps = [turn_calls(call("list_invoices"))] * 7
    r = await client.post("/api/agent/message", json={"message": "loop"}, headers=auth(user))
    assert "ran out of steps" in r.json()["reply"]
    assert len((await fetchone(pool, "select tool_calls from agent_runs"))["tool_calls"]) == 6


async def test_llm_failure(client, pool, user, llm):
    llm.steps = []  # pop from empty list -> exception inside the loop
    r = await client.post("/api/agent/message", json={"message": "hi"}, headers=auth(user))
    assert r.status_code == 502 and r.json()["error"]["code"] == "agent_failed"
    assert (await fetchone(pool, "select status from agent_runs"))["status"] == "failed"


async def test_message_validation_and_auth(client, user):
    r = await client.post("/api/agent/message", json={"message": "x" * 2001}, headers=auth(user))
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"
    r = await client.post("/api/agent/message", json={"message": "hi"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


async def test_draft_reminder_queues_one_for_approval(client, pool, user, llm, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    llm.completion = "Hi John, a gentle reminder that $1,200.00 for the Q3 Video Campaign is overdue. Kwame"
    res = await run_tool(client, user, llm, "draft_reminder", invoice_id=str(s["invoice_id"]))
    assert res["status"] == "awaiting_approval" and res["already_queued"] is False
    assert res["summary"] == "Remind John Doe: $1,200.00 is 5 days overdue"
    assert res["draft_message"].startswith("Hi John") and res["contact"] == "John Doe"

    [a] = await fetchall(pool, "select * from pending_actions where type = 'invoice_reminder'")
    assert a["status"] == "awaiting_approval" and a["trigger_invoice_id"] == s["invoice_id"]
    assert a["agent_run_id"] is not None and str(a["id"]) == res["action_id"]
    assert (await fetchone(pool, "select event from activity_log where entity_id = %s", a["id"]))["event"] \
        == "reminder.drafted"

    # Asking again returns the waiting reminder instead of queueing a second one.
    again = await run_tool(client, user, llm, "draft_reminder", invoice_id=str(s["invoice_id"]))
    assert again["already_queued"] is True and again["action_id"] == res["action_id"]
    assert len(await fetchall(pool, "select id from pending_actions where type = 'invoice_reminder'")) == 1


async def test_draft_reminder_refuses_unsent_and_foreign_invoices(client, pool, user, other_user, llm, adapter):
    s = await sent_invoice_with_payout(pool, adapter, user)
    async with pool.connection() as conn:
        await conn.execute("update invoices set status = 'paid' where id = %s", (s["invoice_id"],))
    res = await run_tool(client, user, llm, "draft_reminder", invoice_id=str(s["invoice_id"]))
    assert "paid" in res["error"]
    res = await run_tool(client, other_user, llm, "draft_reminder", invoice_id=str(s["invoice_id"]))
    assert "No invoice" in res["error"]
    assert await fetchall(pool, "select id from pending_actions where type = 'invoice_reminder'") == []


def test_no_approval_tool():
    assert set(TOOLS) == {"find_contact", "create_contact", "send_invoice", "schedule_payout", "draft_reminder",
                          "list_invoices", "list_pending_actions"}
