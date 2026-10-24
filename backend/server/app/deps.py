from functools import lru_cache

from app.config import get_settings
from app.paypal_contract import PayPalAdapter


@lru_cache
def get_adapter() -> PayPalAdapter:
    """The real adapter (PayPal teammate, server/app/paypal/) or the mock, per PAYPAL_ADAPTER."""
    if get_settings().paypal_adapter == "real":
        # Entry point agreed with the PayPal teammate (see README open questions).
        from app.paypal import get_paypal_adapter  # type: ignore[import-not-found]

        return get_paypal_adapter()
    from app.paypal_mock import MockPayPalAdapter

    # An empty secret deliberately disables mock webhook verification. The mock's
    # signature is public, so accepting it in a deployed environment would let
    # anyone forge "invoice paid" events.
    return MockPayPalAdapter(webhook_secret=get_settings().paypal_mock_webhook_secret or None)
