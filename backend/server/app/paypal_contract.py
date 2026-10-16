# server/app/paypal_contract.py  (Agent & Backend owns this file)
# All money is integer minor units (cents). The adapter converts to PayPal's "1200.00" strings.
from typing import Protocol

from pydantic import BaseModel


class PayPalError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class InvoiceItem(BaseModel):
    name: str
    quantity: int
    unit_amount_minor: int


class SentInvoice(BaseModel):
    paypal_invoice_id: str
    status: str
    payer_view_url: str | None = None


class InvoiceState(BaseModel):
    status: str              # PayPal status: SENT, PAID, MARKED_AS_PAID, PARTIALLY_PAID, CANCELLED, ...
    amount_paid_minor: int
    currency: str


class PayoutResult(BaseModel):
    payout_batch_id: str
    batch_status: str


class PayPalAdapter(Protocol):
    async def create_and_send_invoice(
        self, *, reference: str, recipient_email: str, currency: str,
        items: list[InvoiceItem], recipient_name: str | None = None,
        note: str | None = None, due_date: str | None = None,  # YYYY-MM-DD
    ) -> SentInvoice: ...

    async def get_invoice(self, paypal_invoice_id: str) -> InvoiceState: ...

    async def send_invoice_reminder(self, paypal_invoice_id: str, note: str | None = None) -> None: ...

    async def execute_payout(
        self, *, sender_batch_id: str, recipient_email: str,
        amount_minor: int, currency: str, note: str | None = None,
    ) -> PayoutResult: ...   # sender_batch_id = our idempotency key; PayPal rejects a reused one

    async def get_payout_status(self, payout_batch_id: str) -> str: ...

    async def verify_webhook(self, headers: dict[str, str], raw_body: bytes) -> bool: ...
