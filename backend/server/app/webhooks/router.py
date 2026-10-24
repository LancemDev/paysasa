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
    RetryLater, handle_invoice_cancelled, handle_invoice_paid, handle_payout_batch,
)

log = logging.getLogger(__name__)
router = APIRouter(tags=["webhooks"])

# A PayPal event is a few KB. Refuse anything larger before buffering it, so an
# unauthenticated caller cannot use this endpoint as a memory-exhaustion lever.
MAX_WEBHOOK_BYTES = 1_048_576


def _resp(status: int, **body) -> JSONResponse:
    return JSONResponse(status_code=status, content=body)


async def _read_limited_body(request: Request) -> bytes | None:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_WEBHOOK_BYTES:
                return None
        except ValueError:
            return None
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_WEBHOOK_BYTES:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@router.post("/webhooks/paypal")
async def paypal_webhook(request: Request, adapter: PayPalAdapter = Depends(get_adapter)):
    raw = await _read_limited_body(request)  # exact bytes: signature verification depends on them
    if raw is None:
        return _resp(413, ok=False, error="payload too large")
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
        resource = event.get("resource") or {}
        if not event_id or len(event_id) > 200 or not event_type or len(event_type) > 100:
            raise ValueError("invalid event identity")
        if not isinstance(resource, dict):
            raise ValueError("invalid resource")
        resource_id = resource.get("id")
        if resource_id is not None and len(str(resource_id)) > 200:
            raise ValueError("invalid resource id")
    except (ValueError, KeyError, TypeError):
        return _resp(400, ok=False, error="malformed event")

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
            (event_id, event_type, resource.get("id"), Jsonb(payload)),
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
            else:
                error = None

            await conn.execute(
                "update webhook_events set processed_at = now(), error = %s where id = %s", (error, event_id)
            )
