"""Confirm row changes reach a Supabase realtime subscriber, as the dashboard sees them.

Usage (from server/):
  SUPABASE_URL=... SUPABASE_ANON_KEY=... USER_EMAIL=... USER_PASSWORD=... python scripts/realtime_check.py
Then change a row you own (e.g. POST /dev/simulate-paid/<id>) and watch the events print.
"""
import asyncio
import os

from supabase import acreate_client


async def main() -> None:
    client = await acreate_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    await client.auth.sign_in_with_password({"email": os.environ["USER_EMAIL"], "password": os.environ["USER_PASSWORD"]})
    channel = client.channel("paysasa-realtime-check")
    for table in ("invoices", "pending_actions", "contacts", "activity_log"):
        channel.on_postgres_changes("*", schema="public", table=table,
                                    callback=lambda payload, t=table: print(t, payload))
    await channel.subscribe()
    print("Subscribed; waiting for changes (Ctrl+C to stop)")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
