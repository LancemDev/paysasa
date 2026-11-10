"""POST /webhooks/paypal: verify, store once, apply transitions (Section 8)."""
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from psycopg.types.json import Jsonb

from app.db import get_pool
from app.deps import get_adapter
from app.paypal_contract import PayPalAdapter
from app.webhooks.handlers import (
    PAYOUT_ITEM_FAILURES, RetryLater, handle_invoice_cancelled, handle_invoice_paid, handle_invoice_refunded,
    handle_payout_batch, handle_payout_item, invoice_resource,
)

log = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])


def _resp(status: int, **body) -> JSONResponse:
    return JSONResponse(status_code=status, content=body)


@router.post("/webhooks/paypal")
async def paypal_webhook(request: Request, adapter: PayPalAdapter = Depends(get_adapter)):
    raw = await request.body()  # exact bytes: signature verification depends on them
    headers = {k.lower(): v for k, v in request.headers.items()}
    try:
        verified = await adapter.verify_webhook(headers, raw)
    except Exception:
        log.exception("webhook verification call failed")
        return _resp(500, ok=False, error="verification unavailable")
    if not verified:
        # activity_log needs an owner, and an unverified body can't be trusted to name one; log server-side.
        log.warning("rejected PayPal webhook with bad signature (transmission id %s)",
                    headers.get("paypal-transmission-id"))
        return _resp(400, ok=False, error="invalid signature")

    try:
        event = json.loads(raw)
        event_id, event_type = str(event["id"]), str(event["event_type"])
    except (ValueError, KeyError, TypeError):
        return _resp(400, ok=False, error="malformed event")
    resource = event.get("resource") or {}

    try:
        await process_event(adapter, event_id, event_type, resource, event)
    except RetryLater as e:
        log.info("webhook %s deferred: %s", event_id, e)
        return _resp(500, ok=False, error="retry later")
    except Exception:
        log.exception("webhook %s failed", event_id)
        return _resp(500, ok=False, error="temporary failure")
    return _resp(200, ok=True)


async def process_event(adapter: PayPalAdapter, event_id: str, event_type: str, resource: dict, payload: dict) -> None:
    pool = get_pool()
    async with pool.connection() as conn:
        await conn.execute(
            """insert into webhook_events (id, event_type, resource_id, payload) values (%s, %s, %s, %s)
               on conflict (id) do nothing""",
            (event_id, event_type, invoice_resource(resource).get("id"), Jsonb(payload)),
        )

    async with pool.connection() as conn:
        async with conn.transaction():
            cur = await conn.execute("select processed_at from webhook_events where id = %s for update", (event_id,))
            row = await cur.fetchone()
            if row is None or row["processed_at"] is not None:
                return  # duplicate delivery

            if event_type == "INVOICING.INVOICE.PAID":
                error = await handle_invoice_paid(conn, adapter, resource)
            elif event_type == "INVOICING.INVOICE.CANCELLED":
                error = await handle_invoice_cancelled(conn, resource)
            elif event_type == "PAYMENT.PAYOUTSBATCH.SUCCESS":
                error = await handle_payout_batch(conn, resource, success=True)
            elif event_type == "PAYMENT.PAYOUTSBATCH.DENIED":
                error = await handle_payout_batch(conn, resource, success=False)
            elif event_type == "INVOICING.INVOICE.REFUNDED":
                error = await handle_invoice_refunded(conn, resource)
            elif (event_type.startswith("PAYMENT.PAYOUTS-ITEM.")
                  and event_type.rsplit(".", 1)[-1] in PAYOUT_ITEM_FAILURES):
                error = await handle_payout_item(conn, resource)
            else:
                error = None

            await conn.execute(
                "update webhook_events set processed_at = now(), error = %s where id = %s", (error, event_id)
            )
