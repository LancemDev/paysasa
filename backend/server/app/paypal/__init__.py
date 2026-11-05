"""The real PayPal adapter (paypal.com REST API). Loaded by app.deps.get_adapter() when
PAYPAL_ADAPTER=real. Entry point agreed with the PayPal teammate: a zero-argument factory."""
from app.paypal.adapter import RealPayPalAdapter

__all__ = ["RealPayPalAdapter", "get_paypal_adapter"]


def get_paypal_adapter() -> RealPayPalAdapter:
    from app.config import get_settings

    s = get_settings()
    return RealPayPalAdapter(
        client_id=s.paypal_client_id,
        client_secret=s.paypal_client_secret,
        webhook_id=s.paypal_webhook_id,
        environment=s.paypal_env,
    )
