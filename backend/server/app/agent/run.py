"""One chat message -> LLM tool-calling loop -> reply (Section 7)."""
import logging
from datetime import date
from uuid import UUID

from psycopg.types.json import Jsonb
from psycopg_pool import AsyncConnectionPool

from app.agent.llm import LLM, ToolResult
from app.agent.prompt import build_system_prompt
from app.agent.tools import TOOL_SPECS, ToolContext, execute_tool
from app.money import ALLOWED_CURRENCIES
from app.paypal_contract import PayPalAdapter

log = logging.getLogger(__name__)

MAX_ROUNDS = 6
HISTORY_RUNS = 10
OUT_OF_ROUNDS_REPLY = "I ran out of steps before finishing. Check the dashboard to see what was done."
# Gemini can end a turn with no text and no tool call (a refusal, or a truncated reply).
NOTHING_DONE_REPLY = "I did not do anything with that. Could you rephrase the request?"


class AgentFailed(Exception):
    def __init__(self, run_id: UUID, message: str):
        super().__init__(message)
        self.run_id = run_id


async def run_agent(
    *, pool: AsyncConnectionPool, llm: LLM, adapter: PayPalAdapter, owner_id: UUID, message: str,
    max_amount_minor: int, today: date | None = None,
) -> tuple[UUID, str]:
    today = today or date.today()
    async with pool.connection() as conn:
        cur = await conn.execute(
            "insert into agent_runs (owner_id, user_message) values (%s, %s) returning id", (owner_id, message)
        )
        run_id = (await cur.fetchone())["id"]
        cur = await conn.execute("select default_currency from profiles where id = %s", (owner_id,))
        profile = await cur.fetchone()
        cur = await conn.execute(
            "select name, email, role, aliases from contacts where owner_id = %s order by name", (owner_id,)
        )
        contacts = await cur.fetchall()
        cur = await conn.execute(
            """select user_message, reply from agent_runs
               where owner_id = %s and status = 'completed' and reply is not null
               order by created_at desc limit %s""",
            (owner_id, HISTORY_RUNS),
        )
        history = [(r["user_message"], r["reply"]) for r in reversed(await cur.fetchall())]

    currency = (profile["default_currency"].strip() if profile else "USD")
    ctx = ToolContext(pool=pool, adapter=adapter, owner_id=owner_id, run_id=run_id, user_message=message,
                      default_currency=currency, max_amount_minor=max_amount_minor, today=today)
    system = build_system_prompt(today=today, currency=currency, currencies=ALLOWED_CURRENCIES, contacts=contacts)

    calls_log: list[dict] = []
    try:
        chat = llm.start_chat(system=system, history=history, tools=TOOL_SPECS)
        turn = await chat.send(message)
        rounds = 0
        while turn.calls and rounds < MAX_ROUNDS:
            rounds += 1
            results = []
            for call in turn.calls:
                result = await execute_tool(ctx, call.name, call.args)
                calls_log.append({"name": call.name, "args": call.args, "result": result})
                results.append(ToolResult(name=call.name, result=result, id=call.id))
            turn = await chat.send(results)
        reply = OUT_OF_ROUNDS_REPLY if turn.calls else (turn.text or NOTHING_DONE_REPLY)
    except Exception as e:
        log.exception("agent run %s failed", run_id)
        async with pool.connection() as conn:
            await conn.execute(
                "update agent_runs set status = 'failed', error = %s, tool_calls = %s where id = %s",
                (f"{type(e).__name__}: {e}", Jsonb(calls_log), run_id),
            )
        raise AgentFailed(run_id, str(e)) from e

    async with pool.connection() as conn:
        await conn.execute(
            "update agent_runs set status = 'completed', reply = %s, tool_calls = %s where id = %s",
            (reply, Jsonb(calls_log), run_id),
        )
    return run_id, reply
