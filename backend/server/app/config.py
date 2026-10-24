from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    anthropic_api_key: str = ""
    llm_model: str = "claude-sonnet-5-5"  # or claude-opus-5-5 / claude-haiku-5-5
    paypal_adapter: Literal["real", "mock"] = "mock"
    max_amount_minor: int = 1_000_000
    enable_dev_routes: bool = False
    cors_origin: str = "http://localhost:3000"
    # Upper bound on an assistant request per user per minute. 0 disables the limit.
    agent_rate_limit_per_minute: int = 20
    # Supabase token introspection must fail closed and must not hang a request.
    auth_timeout_seconds: float = 5.0
    # The mock adapter accepts webhooks only when this secret is configured. Leave empty
    # in production: the mock must never be able to forge a "paid" event there.
    paypal_mock_webhook_secret: str = ""

    # Handed over by the PayPal teammate; read only by their adapter.
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_env: str = "sandbox"


@lru_cache
def get_settings() -> Settings:
    return Settings()
