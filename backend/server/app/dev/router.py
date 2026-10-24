"""Rehearsal helpers. Mounted only when ENABLE_DEV_ROUTES=true.

Even when mounted, these routes are normal authenticated endpoints: a caller can
only simulate payment for, or run the chase job over, their own invoices.
"""
from uuid import UUID

from fastapi import APIRouter, Depends

from app.agent.llm import LLM, get_llm
from app.auth import get_user_id
from app.db import get_pool
from app.errors import AppError
from app.jobs.chase import run_chase
from app.webhooks.handlers import apply_invoice_paid

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/simulate-paid/{invoice_id}")
async def simulate_paid(invoice_id: UUID, user_id: UUID = Depends(get_user_id)):
    async with get_pool().connection() as conn:
        async with conn.transaction():
            cur = await conn.execute(
                """select i.*, c.name as contact_name from invoices i
                   join contacts c on c.id = i.contact_id and c.owner_id = i.owner_id
                   where i.id = %s and i.owner_id = %s for update of i""",
                (invoice_id, user_id),
            )
            invoice = await cur.fetchone()
            if invoice is None:
                raise AppError(404, "not_found", "Invoice not found")
            if invoice["status"] != "sent":
                raise AppError(409, "conflict", f"Invoice is {invoice['status']}, not sent")
            await apply_invoice_paid(conn, invoice, actor="system", paypal_status="PAID")
            cur = await conn.execute("select * from invoices where id = %s and owner_id = %s",
                                     (invoice_id, user_id))
            row = await cur.fetchone()
    return {"invoice": {k: (str(v) if isinstance(v, UUID) else v.isoformat() if hasattr(v, "isoformat") else v)
                        for k, v in row.items()}}


@router.post("/run-chase")
async def run_chase_now(llm: LLM = Depends(get_llm), user_id: UUID = Depends(get_user_id)):
    return {"created": await run_chase(get_pool(), llm, owner_id=user_id)}
