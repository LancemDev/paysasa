"""Real PayPal adapter. Implements app.paypal_contract.PayPalAdapter against the PayPal REST API.

Sandbox vs live is chosen by `PAYPAL_ENV` (`sandbox` -> api-m.sandbox.paypal.com, anything else ->
api-m.paypal.com). OAuth tokens are cached per instance; `sender_batch_id` idempotency is enforced
by PayPal itself (a reused key is rejected with DUPLICATE_REQUEST_ID).
"""
import asyncio
import json
import logging
import time
from decimal import Decimal

import httpx

from app.paypal_contract import (
    InvoiceItem, InvoiceState, PayoutResult, PayPalError, SentInvoice,
)

log = logging.getLogger(__name__)

SANDBOX_BASE = "https://api-m.sandbox.paypal.com"
LIVE_BASE = "https://api-m.paypal.com"
TOKEN_EXPIRY_LEEWAY_SECONDS = 60


def _format_amount(amount_minor: int) -> str:
    return f"{amount_minor // 100}.{amount_minor % 100:02d}"


def _parse_amount(value) -> int:
    if value is None:
        return 0
    return int((Decimal(str(value)) * 100).to_integral_value())


def _split_name(full_name: str) -> dict:
    parts = full_name.split()
    if len(parts) == 1:
        return {"given_name": parts[0]}
    return {"given_name": " ".join(parts[:-1]), "surname": parts[-1]}


class RealPayPalAdapter:
    def __init__(self, *, client_id: str, client_secret: str, webhook_id: str = "",
                 environment: str = "sandbox", http: httpx.AsyncClient | None = None):
        if not client_id or not client_secret:
            raise PayPalError("MISSING_CREDENTIALS", "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set")
        self._client_id = client_id
        self._client_secret = client_secret
        self._webhook_id = webhook_id
        self._base = LIVE_BASE if environment.lower() not in ("", "sandbox", "test") else SANDBOX_BASE
        self._http = http
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    # --- HTTP plumbing ------------------------------------------------------
    async def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(base_url=self._base, timeout=30.0)
        return self._http

    async def _request(self, method: str, path: str, *, token: bool = True, **kwargs) -> dict:
        client = await self._client()
        headers = dict(kwargs.pop("headers", {}) or {})
        if token:
            headers["Authorization"] = f"Bearer {await self._access_token()}"
        headers.setdefault("Content-Type", "application/json")
        resp = await client.request(method, path, headers=headers, **kwargs)
        if resp.status_code >= 400:
            raise _to_paypal_error(resp)
        if resp.status_code == 204 or not resp.content:
            return {}
        return resp.json()

    async def _access_token(self) -> str:
        async with self._token_lock:
            now = time.time()
            if self._token and now < self._token_expires_at - TOKEN_EXPIRY_LEEWAY_SECONDS:
                return self._token
            client = await self._client()
            resp = await client.post(
                "/v1/oauth2/token",
                data={"grant_type": "client_credentials"},
                auth=(self._client_id, self._client_secret),
                headers={"Accept": "application/json", "Accept-Language": "en_US"},
            )
            if resp.status_code >= 400:
                raise _to_paypal_error(resp)
            body = resp.json()
            self._token = body["access_token"]
            self._token_expires_at = time.time() + float(body.get("expires_in", 3600))
            return self._token

    # --- contract -----------------------------------------------------------
    async def create_and_send_invoice(
        self, *, reference: str, recipient_email: str, currency: str,
        items: list[InvoiceItem], recipient_name: str | None = None,
        note: str | None = None, due_date: str | None = None,  # YYYY-MM-DD
    ) -> SentInvoice:
        currency = currency.strip().upper()
        detail: dict = {"currency_code": currency, "reference": str(reference)[:120]}
        if note:
            detail["note"] = note
        if due_date:
            detail["due_date"] = due_date
        billing_info: dict = {"email_address": recipient_email}
        if recipient_name:
            billing_info["name"] = _split_name(recipient_name.strip())
        draft = await self._request("POST", "/v2/invoicing/invoices", json={
            "detail": detail,
            "primary_recipients": [{"billing_info": billing_info}],
            "items": [
                {
                    "name": item.name,
                    "quantity": str(item.quantity),
                    "unit_amount": {"currency_code": currency,
                                    "value": _format_amount(item.unit_amount_minor)},
                }
                for item in items
            ],
        })
        invoice_id = draft["id"]
        sent = await self._request(
            "POST", f"/v2/invoicing/invoices/{invoice_id}/send",
            json={"send_to_recipient": True, "send_to_invoicer": True},
        )
        recipient_view_url = ((sent.get("detail") or {}).get("metadata") or {}).get("recipient_view_url")
        return SentInvoice(paypal_invoice_id=invoice_id, status=sent.get("status", "SENT"),
                           payer_view_url=recipient_view_url)

    async def get_invoice(self, paypal_invoice_id: str) -> InvoiceState:
        inv = await self._request("GET", f"/v2/invoicing/invoices/{paypal_invoice_id}")
        status = inv.get("status", "")
        currency = (inv.get("detail") or {}).get("currency_code", "").strip()
        paid = (inv.get("payment_summary") or {}).get("paid_amount")
        if paid is None:
            paid = (inv.get("payments") or {}).get("paid_amount")
        return InvoiceState(status=status, amount_paid_minor=_parse_amount((paid or {}).get("value")),
                            currency=currency)

    async def send_invoice_reminder(self, paypal_invoice_id: str, note: str | None = None) -> None:
        body = {"subject": "Reminder: your invoice is overdue"}
        if note:
            body["note"] = note
        await self._request("POST", f"/v2/invoicing/invoices/{paypal_invoice_id}/remind", json=body)

    async def execute_payout(
        self, *, sender_batch_id: str, recipient_email: str,
        amount_minor: int, currency: str, note: str | None = None,
    ) -> PayoutResult:
        currency = currency.strip().upper()
        body = {
            "sender_batch_header": {
                "sender_batch_id": sender_batch_id,
                "email_subject": "You have a payout from PaySasa",
                "email_message": note or "You have received a payout.",
            },
            "items": [{
                "recipient_type": "EMAIL",
                "amount": {"value": _format_amount(amount_minor), "currency": currency},
                "receiver": recipient_email,
                "sender_item_id": sender_batch_id,
                "note": note or "",
            }],
        }
        resp = await self._request("POST", "/v1/payments/payouts", json=body)
        header = resp.get("batch_header") or {}
        return PayoutResult(payout_batch_id=header.get("payout_batch_id", ""),
                            batch_status=header.get("batch_status", ""))

    async def get_payout_status(self, payout_batch_id: str) -> str:
        resp = await self._request("GET", f"/v1/payments/payouts/{payout_batch_id}")
        return (resp.get("batch_header") or {}).get("batch_status", "")

    async def verify_webhook(self, headers: dict[str, str], raw_body: bytes) -> bool:
        if not self._webhook_id:
            log.warning("PAYPAL_WEBHOOK_ID is not set; rejecting webhook")
            return False
        lowered = {k.lower(): v for k, v in headers.items()}
        required = ("paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id",
                    "paypal-transmission-sig", "paypal-transmission-time")
        if not all(lowered.get(k) for k in required):
            log.warning("PayPal webhook missing transmission headers: %s",
                        [k for k in required if not lowered.get(k)])
            return False
        try:
            event = json.loads(raw_body)
        except ValueError:
            log.warning("PayPal webhook body is not valid JSON")
            return False
        try:
            resp = await self._request("POST", "/v1/notifications/verify-webhook-signature", json={
                "auth_algo": lowered["paypal-auth-algo"],
                "cert_url": lowered["paypal-cert-url"],
                "transmission_id": lowered["paypal-transmission-id"],
                "transmission_sig": lowered["paypal-transmission-sig"],
                "transmission_time": lowered["paypal-transmission-time"],
                "webhook_id": self._webhook_id,
                "webhook_event": event,
            })
        except PayPalError:
            log.exception("PayPal webhook signature verification call failed")
            return False
        return resp.get("verification_status") == "SUCCESS"


def _to_paypal_error(resp: httpx.Response) -> PayPalError:
    try:
        body = resp.json()
    except ValueError:
        return PayPalError(str(resp.status_code), resp.text[:500] or f"HTTP {resp.status_code}")
    details = body.get("details") or []
    issue = details[0].get("issue") if details and isinstance(details[0], dict) else None
    description = details[0].get("description") if details and isinstance(details[0], dict) else None
    code = body.get("name") or issue or str(resp.status_code)
    message = description or body.get("message") or body.get("error_description") or json.dumps(body)[:500]
    return PayPalError(str(code), str(message))
