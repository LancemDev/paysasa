"""Bearer Supabase access token -> user_id."""
import asyncio
from uuid import UUID

from fastapi import Request

from app.config import get_settings
from app.errors import AppError

_client = None
_client_lock = asyncio.Lock()

# Supabase access tokens are JWTs; anything much longer is not a token we should send upstream.
_MAX_TOKEN_CHARS = 8192


async def _supabase():
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                from supabase import acreate_client

                s = get_settings()
                _client = await acreate_client(s.supabase_url, s.supabase_service_role_key)
    return _client


async def get_user_id(request: Request) -> UUID:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise AppError(401, "unauthorized", "Missing Bearer token")
    if len(token) > _MAX_TOKEN_CHARS:
        raise AppError(401, "unauthorized", "Invalid or expired token")
    try:
        client = await _supabase()
        res = await asyncio.wait_for(
            client.auth.get_user(token), timeout=get_settings().auth_timeout_seconds
        )
    except Exception:
        # Fail closed: a network problem, a Supabase outage or a malformed token all mean "not signed in".
        raise AppError(401, "unauthorized", "Invalid or expired token")
    if res is None or res.user is None:
        raise AppError(401, "unauthorized", "Invalid or expired token")
    try:
        return UUID(res.user.id)
    except (TypeError, ValueError):
        raise AppError(401, "unauthorized", "Invalid or expired token")
