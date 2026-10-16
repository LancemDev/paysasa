"""Tests run against a real Postgres (TEST_DATABASE_URL) and the mock PayPal adapter.

TEST_DATABASE_URL must point at a server where the user may create databases, e.g.
postgresql://postgres@localhost:5432/postgres. A fresh database is created per test session.
"""
import os
import uuid
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "postgresql://unused")
os.environ["ENABLE_DEV_ROUTES"] = "true"
os.environ["PAYPAL_ADAPTER"] = "mock"
os.environ["MAX_AMOUNT_MINOR"] = "1000000"

import httpx
import psycopg
import pytest
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from app import db as db_module
from app.agent.llm import LLMTurn, ToolCall, ToolResult, get_llm
from app.auth import get_user_id
from app.deps import get_adapter
from app.errors import AppError
from app.main import create_app
from app.paypal_mock import MockPayPalAdapter

ROOT = Path(__file__).resolve().parents[2]
TABLES = "activity_log, pending_actions, invoices, agent_runs, contacts, profiles, webhook_events"


@pytest.fixture(scope="session")
def database_url():
    admin = os.environ.get("TEST_DATABASE_URL")
    if not admin:
        pytest.skip("TEST_DATABASE_URL is not set")
    name = f"paysasa_test_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    url = make_conninfo(**{**conninfo_to_dict(admin), "dbname": name})
    with psycopg.connect(url, autocommit=True) as c:
        c.execute((Path(__file__).parent / "supabase_shim.sql").read_text())
        c.execute((ROOT / "supabase/migrations/0001_init.sql").read_text())
        c.execute("grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated")
    yield url
    with psycopg.connect(admin, autocommit=True) as c:
        c.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(name)))


@pytest.fixture
async def pool(database_url):
    with psycopg.connect(database_url, autocommit=True) as c:
        c.execute(f"truncate {TABLES}, auth.users cascade")
    p = db_module.make_pool(database_url, min_size=1, max_size=10)
    await p.open(wait=True)
    db_module._pool = p
    yield p
    db_module._pool = None
    await p.close()


async def make_user(pool, name: str) -> dict:
    uid = uuid.uuid4()
    async with pool.connection() as conn:
        await conn.execute("insert into auth.users (id, email) values (%s, %s)", (uid, f"{name.lower()}@test.local"))
        await conn.execute("insert into profiles (id, display_name) values (%s, %s)", (uid, name))
        cur = await conn.execute(
            """insert into contacts (owner_id, name, email, role, aliases) values
               (%s, 'John Doe', 'john@example.com', 'client', '{}'),
               (%s, 'Sarah', 'sarah@example.com', 'contractor', '{"my editor"}')
               returning id, name""",
            (uid, uid),
        )
        contacts = {r["name"]: r["id"] for r in await cur.fetchall()}
    return {"id": uid, "john": contacts["John Doe"], "sarah": contacts["Sarah"]}


@pytest.fixture
async def user(pool):
    return await make_user(pool, "Kwame")


@pytest.fixture
async def other_user(pool):
    return await make_user(pool, "Amara")


@pytest.fixture
def adapter():
    return MockPayPalAdapter()


class FakeChat:
    def __init__(self, llm):
        self.llm = llm

    async def send(self, content):
        self.llm.received.append(content)
        step = self.llm.steps.pop(0)
        last = content if isinstance(content, list) else None
        return step(last) if callable(step) else step


class FakeLLM:
    """Scripted LLM. Each step is an LLMTurn, or a function of the previous tool results returning one."""

    def __init__(self, steps=None, completion="", fail=False):
        self.steps = list(steps or [])
        self.received: list = []
        self.completion = completion
        self.fail = fail
        self.systems: list[str] = []

    def start_chat(self, *, system, history, tools):
        self.systems.append(system)
        self.history = history
        return FakeChat(self)

    async def complete(self, *, system, prompt):
        if self.fail:
            raise RuntimeError("llm down")
        return self.completion


@pytest.fixture
def llm():
    return FakeLLM()


@pytest.fixture
async def client(pool, adapter, llm):
    app = create_app(manage_pool=False)

    async def fake_user(request):
        header = request.headers.get("authorization", "")
        try:
            return uuid.UUID(header.removeprefix("Bearer ").strip())
        except ValueError:
            raise AppError(401, "unauthorized", "Invalid or expired token")

    from fastapi import Request

    async def dep(request: Request):
        return await fake_user(request)

    app.dependency_overrides[get_user_id] = dep
    app.dependency_overrides[get_adapter] = lambda: adapter
    app.dependency_overrides[get_llm] = lambda: llm
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


def auth(user) -> dict:
    return {"Authorization": f"Bearer {user['id']}"}


def call(name, /, **args) -> ToolCall:
    return ToolCall(name=name, args=args, id=f"call-{name}")


def turn_calls(*calls) -> LLMTurn:
    return LLMTurn(text=None, calls=list(calls))


def reply(text) -> LLMTurn:
    return LLMTurn(text=text)


def result_of(results: list[ToolResult], name: str) -> dict:
    return next(r.result for r in results if r.name == name)


async def fetchall(pool, query, *params):
    async with pool.connection() as conn:
        cur = await conn.execute(query, params)
        return await cur.fetchall()


async def fetchone(pool, query, *params):
    rows = await fetchall(pool, query, *params)
    return rows[0] if rows else None
