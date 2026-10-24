import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.actions.router import router as actions_router
from app.agent.router import router as agent_router
from app.config import get_settings
from app.contacts.router import router as contacts_router
from app.db import close_pool, open_pool
from app.errors import install_error_handlers
from app.security import SecurityHeadersMiddleware
from app.webhooks.router import router as webhooks_router

logging.basicConfig(level=logging.INFO)


def create_app(*, manage_pool: bool = True) -> FastAPI:
    settings = get_settings()
    if settings.paypal_adapter == "real" and not settings.paypal_webhook_id:
        raise RuntimeError("PAYPAL_WEBHOOK_ID is required when PAYPAL_ADAPTER=real")
    if settings.paypal_adapter == "mock":
        logging.warning("PAYPAL_ADAPTER=mock: no real money moves; mock webhooks need PAYPAL_MOCK_WEBHOOK_SECRET")
    if settings.enable_dev_routes:
        logging.warning("ENABLE_DEV_ROUTES=true: /dev/* rehearsal routes are mounted (authenticated, owner-scoped)")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if manage_pool:
            await open_pool(settings.database_url, min_size=1, max_size=10)
        yield
        if manage_pool:
            await close_pool()

    # API docs are useful locally but expose the whole attack surface in production.
    docs_enabled = settings.enable_dev_routes
    app = FastAPI(
        title="PaySasa API",
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origin.split(",") if o.strip()],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    install_error_handlers(app)

    @app.get("/health")
    async def health():
        return {"ok": True}

    app.include_router(agent_router)
    app.include_router(actions_router)
    app.include_router(contacts_router)
    app.include_router(webhooks_router)
    if settings.enable_dev_routes:
        from app.dev.router import router as dev_router

        app.include_router(dev_router)
    return app


app = create_app()
