"""In-memory stand-in for the PayPal adapter. Implements app.paypal_contract.PayPalAdapter.

Webhook verification accepts a request whose `paypal-transmission-sig` header equals MOCK_SIGNATURE.
Tests can queue failures with fail_next(method, PayPalError(...)) and set invoice states directly.
"""
import asyncio
import itertools

from app.paypal_contract import (
    InvoiceItem, InvoiceState, PayoutResult, PayPalError, SentInvoice,
)

MOCK_SIGNATURE = "mock-valid-signature"


class MockPayPalAdapter:
    def __init__(self, delay_seconds: float = 0.0):
        self.delay_seconds = delay_seconds
        self.invoices: dict[str, dict] = {}
        self.payouts: dict[str, dict] = {}          # keyed by sender_batch_id
        self.reminders: list[tuple[str, str | None]] = []
        self.calls: list[tuple[str, dict]] = []
        self._failures: dict[str, list[PayPalError]] = {}
        self._ids = itertools.count(1)

    # --- test helpers -------------------------------------------------------
    def fail_next(self, method: str, error: PayPalError) -> None:
        self._failures.setdefault(method, []).append(error)

    def set_invoice_status(self, paypal_invoice_id: str, status: str, amount_paid_minor: int | None = None) -> None:
        inv = self.invoices[paypal_invoice_id]
        inv["status"] = status
        if amount_paid_minor is not None:
            inv["amount_paid_minor"] = amount_paid_minor
        elif status in ("PAID", "MARKED_AS_PAID"):
            inv["amount_paid_minor"] = inv["total_minor"]

    async def _enter(self, method: str, **args) -> None:
        self.calls.append((method, args))
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        queued = self._failures.get(method)
        if queued:
            raise queued.pop(0)

    # --- contract -----------------------------------------------------------
    async def create_and_send_invoice(
        self, *, reference: str, recipient_email: str, currency: str,
        items: list[InvoiceItem], recipient_name: str | None = None,
        note: str | None = None, due_date: str | None = None,
    ) -> SentInvoice:
        await self._enter("create_and_send_invoice", reference=reference, recipient_email=recipient_email,
                          currency=currency, items=items, recipient_name=recipient_name, due_date=due_date)
        inv_id = f"INV2-MOCK-{next(self._ids):04d}"
        self.invoices[inv_id] = {
            "reference": reference, "status": "SENT", "currency": currency, "amount_paid_minor": 0,
            "total_minor": sum(i.quantity * i.unit_amount_minor for i in items),
            "recipient_email": recipient_email,
        }
        return SentInvoice(paypal_invoice_id=inv_id, status="SENT",
                           payer_view_url=f"https://mock.paypal.local/invoice/p/#{inv_id}")

    async def get_invoice(self, paypal_invoice_id: str) -> InvoiceState:
        await self._enter("get_invoice", paypal_invoice_id=paypal_invoice_id)
        inv = self.invoices.get(paypal_invoice_id)
        if inv is None:
            raise PayPalError("RESOURCE_NOT_FOUND", f"Invoice {paypal_invoice_id} not found")
        return InvoiceState(status=inv["status"], amount_paid_minor=inv["amount_paid_minor"], currency=inv["currency"])

    async def send_invoice_reminder(self, paypal_invoice_id: str, note: str | None = None) -> None:
        await self._enter("send_invoice_reminder", paypal_invoice_id=paypal_invoice_id, note=note)
        if paypal_invoice_id not in self.invoices:
            raise PayPalError("RESOURCE_NOT_FOUND", f"Invoice {paypal_invoice_id} not found")
        self.reminders.append((paypal_invoice_id, note))

    async def execute_payout(
        self, *, sender_batch_id: str, recipient_email: str,
        amount_minor: int, currency: str, note: str | None = None,
    ) -> PayoutResult:
        await self._enter("execute_payout", sender_batch_id=sender_batch_id, recipient_email=recipient_email,
                          amount_minor=amount_minor, currency=currency, note=note)
        if sender_batch_id in self.payouts:
            raise PayPalError("DUPLICATE_REQUEST_ID",
                              "Batch with given sender_batch_id already exists")
        batch_id = f"MOCKBATCH{next(self._ids):06d}"
        self.payouts[sender_batch_id] = {
            "payout_batch_id": batch_id, "recipient_email": recipient_email,
            "amount_minor": amount_minor, "currency": currency, "status": "PENDING",
        }
        return PayoutResult(payout_batch_id=batch_id, batch_status="PENDING")

    async def get_payout_status(self, payout_batch_id: str) -> str:
        await self._enter("get_payout_status", payout_batch_id=payout_batch_id)
        for p in self.payouts.values():
            if p["payout_batch_id"] == payout_batch_id:
                return p["status"]
        raise PayPalError("RESOURCE_NOT_FOUND", f"Payout batch {payout_batch_id} not found")

    async def verify_webhook(self, headers: dict[str, str], raw_body: bytes) -> bool:
        lowered = {k.lower(): v for k, v in headers.items()}
        return lowered.get("paypal-transmission-sig") == MOCK_SIGNATURE
