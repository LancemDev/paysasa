"""The real PayPal adapter against a mocked HTTP transport (no network)."""
import json

import httpx
import pytest

from app.paypal.adapter import RealPayPalAdapter, _format_amount, _parse_amount, _split_name
from app.paypal_contract import InvoiceItem, PayPalError

TOKEN = {"access_token": "tok-123", "expires_in": 3600}


def adapter(handler, **kwargs) -> RealPayPalAdapter:
    http = httpx.AsyncClient(base_url="https://api-m.sandbox.paypal.com",
                             transport=httpx.MockTransport(handler))
    kwargs.setdefault("webhook_id", "WH-1")
    return RealPayPalAdapter(client_id="cid", client_secret="secret", http=http, **kwargs)


def json_response(status: int, body) -> httpx.Response:
    return httpx.Response(status, json=body)


def test_amount_round_trip():
    assert _format_amount(0) == "0.00"
    assert _format_amount(1200) == "12.00"
    assert _format_amount(100050) == "1000.50"
    assert _parse_amount("12.00") == 1200
    assert _parse_amount("1000.50") == 100050
    assert _parse_amount(None) == 0


def test_split_name():
    assert _split_name("Sarah") == {"given_name": "Sarah"}
    assert _split_name("Sarah Jones") == {"given_name": "Sarah", "surname": "Jones"}
    assert _split_name("Mary Jane Watson") == {"given_name": "Mary Jane", "surname": "Watson"}


async def test_token_is_fetched_once_and_cached():
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        if request.url.path.startswith("/v2/invoicing/invoices/") and request.method == "GET":
            return json_response(200, {"status": "UNPAID", "detail": {"currency_code": "USD"},
                                       "payment_summary": {"paid_amount": {"currency_code": "USD", "value": "0.00"}}})
        return json_response(404, {"name": "RESOURCE_NOT_FOUND", "message": "nope"})

    a = adapter(handler)
    await a.get_invoice("INV2-1")
    await a.get_invoice("INV2-1")
    assert calls.count(("POST", "/v1/oauth2/token")) == 1
    assert calls.count(("GET", "/v2/invoicing/invoices/INV2-1")) == 2


async def test_create_and_send_invoice():
    seen = []

    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        body = json.loads(request.content)
        seen.append((request.url.path, body))
        if request.url.path == "/v2/invoicing/invoices":
            return json_response(201, {"id": "INV2-ABC", "status": "DRAFT"})
        if request.url.path == "/v2/invoicing/invoices/INV2-ABC/send":
            return json_response(200, {"id": "INV2-ABC", "status": "SENT",
                                       "detail": {"metadata": {"recipient_view_url": "https://paypal.example/view"}}})
        return json_response(404, {"name": "RESOURCE_NOT_FOUND"})

    a = adapter(handler)
    sent = await a.create_and_send_invoice(
        reference="invoice-uuid", recipient_email="client@example.com", currency="usd",
        items=[InvoiceItem(name="Website design", quantity=2, unit_amount_minor=50000)],
        recipient_name="Mary Jane Watson", note="Thanks", due_date="2026-12-01",
    )

    assert sent.paypal_invoice_id == "INV2-ABC"
    assert sent.status == "SENT"
    assert sent.payer_view_url == "https://paypal.example/view"

    create = seen[0][1]
    assert create["detail"]["currency_code"] == "USD"
    assert create["detail"]["reference"] == "invoice-uuid"
    assert create["detail"]["due_date"] == "2026-12-01"
    assert create["primary_recipients"][0]["billing_info"]["email_address"] == "client@example.com"
    assert create["primary_recipients"][0]["billing_info"]["name"] == {"given_name": "Mary Jane", "surname": "Watson"}
    assert create["items"] == [{"name": "Website design", "quantity": "2",
                                "unit_amount": {"currency_code": "USD", "value": "500.00"}}]
    assert seen[1][0] == "/v2/invoicing/invoices/INV2-ABC/send"
    assert seen[1][1]["send_to_recipient"] is True


async def test_get_invoice_parses_paid_amount():
    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        return json_response(200, {
            "status": "PAID",
            "detail": {"currency_code": "GBP"},
            "payment_summary": {"paid_amount": {"currency_code": "GBP", "value": "250.50"}},
        })

    a = adapter(handler)
    state = await a.get_invoice("INV2-XYZ")
    assert (state.status, state.amount_paid_minor, state.currency) == ("PAID", 25050, "GBP")


async def test_send_invoice_reminder():
    seen = []

    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        seen.append((request.url.path, json.loads(request.content)))
        return json_response(200, {})

    a = adapter(handler)
    await a.send_invoice_reminder("INV2-XYZ", "Please pay")
    assert seen == [("/v2/invoicing/invoices/INV2-XYZ/remind",
                     {"subject": "Reminder: your invoice is overdue", "note": "Please pay"})]


async def test_execute_payout_sends_sender_batch_id():
    seen = []

    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        seen.append(json.loads(request.content))
        return json_response(201, {"batch_header": {"payout_batch_id": "BATCH-1", "batch_status": "PENDING",
                                                    "sender_batch_header": {"sender_batch_id": seen[0]["sender_batch_header"]["sender_batch_id"]}}})

    a = adapter(handler)
    result = await a.execute_payout(sender_batch_id="idem-key-1", recipient_email="payee@example.com",
                                    amount_minor=123450, currency="USD", note="thanks")
    body = seen[0]
    assert body["sender_batch_header"]["sender_batch_id"] == "idem-key-1"
    assert body["items"][0]["amount"] == {"value": "1234.50", "currency": "USD"}
    assert body["items"][0]["receiver"] == "payee@example.com"
    assert body["items"][0]["sender_item_id"] == "idem-key-1"
    assert (result.payout_batch_id, result.batch_status) == ("BATCH-1", "PENDING")


async def test_get_payout_status():
    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        return json_response(200, {"batch_header": {"batch_status": "SUCCESS"}})

    a = adapter(handler)
    assert await a.get_payout_status("BATCH-1") == "SUCCESS"


async def test_verify_webhook_success_and_failure():
    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        body = json.loads(request.content)
        assert body["webhook_id"] == "WH-1"
        assert body["webhook_event"] == {"id": "WH-EVENT-1", "event_type": "INVOICING.INVOICE.PAID"}
        status = "SUCCESS" if body["transmission_id"] == "good" else "FAILURE"
        return json_response(200, {"verification_status": status})

    a = adapter(handler)
    base_headers = {"PAYPAL-AUTH-ALGO": "algo", "PAYPAL-CERT-URL": "https://cert",
                    "PAYPAL-TRANSMISSION-ID": "good", "PAYPAL-TRANSMISSION-SIG": "sig",
                    "PAYPAL-TRANSMISSION-TIME": "2026-11-05T00:00:00Z"}
    raw = b'{"id": "WH-EVENT-1", "event_type": "INVOICING.INVOICE.PAID"}'
    assert await a.verify_webhook(base_headers, raw) is True
    assert await a.verify_webhook({**base_headers, "PAYPAL-TRANSMISSION-ID": "bad"}, raw) is False


async def test_verify_webhook_without_webhook_id_rejects_without_http():
    def handler(request):
        raise AssertionError("no HTTP call expected")

    a = adapter(handler, webhook_id="")
    headers = {"paypal-auth-algo": "a", "paypal-cert-url": "c", "paypal-transmission-id": "t",
               "paypal-transmission-sig": "s", "paypal-transmission-time": "2026-11-05T00:00:00Z"}
    assert await a.verify_webhook(headers, b"{}") is False


async def test_verify_webhook_missing_headers():
    def handler(request):
        raise AssertionError("no HTTP call expected")

    a = adapter(handler)
    assert await a.verify_webhook({"paypal-transmission-sig": "sig"}, b"{}") is False


async def test_paypal_error_mapping():
    def handler(request):
        if request.url.path == "/v1/oauth2/token":
            return json_response(200, TOKEN)
        return json_response(422, {"name": "INVALID_REQUEST", "message": "bad",
                                   "details": [{"issue": "MISSING_NAME", "description": "items is required"}]})

    a = adapter(handler)
    with pytest.raises(PayPalError) as e:
        await a.get_invoice("INV2-BAD")
    assert e.value.code == "INVALID_REQUEST"
    assert "items is required" in e.value.message
