"""Row-level security: a signed-in user reads only their own rows."""
from tests.helpers import sent_invoice_with_payout


async def test_users_read_only_their_rows(pool, user, other_user, adapter):
    await sent_invoice_with_payout(pool, adapter, user)
    await sent_invoice_with_payout(pool, adapter, other_user)
    for who in (user, other_user):
        async with pool.connection() as conn:
            async with conn.transaction():
                await conn.execute("set local role authenticated")
                await conn.execute("select set_config('request.jwt.claim.sub', %s, true)", (str(who["id"]),))
                for table in ("invoices", "pending_actions", "contacts", "profiles"):
                    cur = await conn.execute(f"select * from {table}")
                    rows = await cur.fetchall()
                    owner_col = "id" if table == "profiles" else "owner_id"
                    assert rows and all(r[owner_col] == who["id"] for r in rows), table
                cur = await conn.execute("select count(*) as n from webhook_events")
                assert (await cur.fetchone())["n"] == 0
                # Writes are server-only
                cur = await conn.execute("select has_table_privilege('authenticated', 'invoices', 'UPDATE') as w")
                assert (await cur.fetchone())["w"] is False


async def test_realtime_publication(pool):
    async with pool.connection() as conn:
        cur = await conn.execute("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")
        assert {r["tablename"] for r in await cur.fetchall()} == {"invoices", "pending_actions", "contacts", "activity_log"}
