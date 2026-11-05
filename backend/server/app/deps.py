"""The real adapter (app/paypal/) or the mock, per PAYPAL_ADAPTER."""
from functools import lru_cache

from app.config import get_settings
from app.paypal_contract import PayPalAdapter


@lru_cache
def get_adapter() -> PayPalAdapter:
    if get_settings().paypal_adapter == "real":
        from app.paypal import get_paypal_adapter

        return get_paypal_adapter()
    from app.paypal_mock import MockPayPalAdapter

    return MockPayPalAdapter()
