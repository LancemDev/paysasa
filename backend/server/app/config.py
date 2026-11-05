from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    gemini_api_key: str = ""
    llm_model: str = "gemini-flash-latest"  # or gemini-pro-latest
    paypal_adapter: Literal["real", "mock"] = "mock"
    max_amount_minor: int = 1_000_000
    enable_dev_routes: bool = False
    cors_origin: str = "http://localhost:3000"

    # Handed over by the PayPal teammate; read only by their adapter.
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""
    paypal_env: str = "sandbox"


@lru_cache
def get_settings() -> Settings:
    return Settings()
