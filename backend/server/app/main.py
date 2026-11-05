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
from app.webhooks.router import router as webhooks_router

logging.basicConfig(level=logging.INFO)


def create_app(*, manage_pool: bool = True) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if manage_pool:
            await open_pool(settings.database_url, min_size=1, max_size=10)
        yield
        if manage_pool:
            await close_pool()

    app = FastAPI(title="PaySasa API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origin.split(",") if o.strip()],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    install_error_handlers(app)

    @app.get("/health")
    async def health():
        # Tells the UI which PayPal it is talking to, so the banner can't drift from the server.
        mode = "mock" if settings.paypal_adapter == "mock" else ("sandbox" if settings.paypal_env.lower() in ("", "sandbox", "test") else "live")
        return {"ok": True, "paypal": mode}

    app.include_router(agent_router)
    app.include_router(actions_router)
    app.include_router(contacts_router)
    app.include_router(webhooks_router)
    if settings.enable_dev_routes:
        from app.dev.router import router as dev_router

        app.include_router(dev_router)
    return app


app = create_app()
