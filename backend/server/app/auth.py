"""Bearer Supabase access token -> user_id."""
from uuid import UUID

from fastapi import Request

from app.config import get_settings
from app.errors import AppError

_client = None


async def _supabase():
    global _client
    if _client is None:
        from supabase import acreate_client

        s = get_settings()
        _client = await acreate_client(s.supabase_url, s.supabase_service_role_key)
    return _client


async def get_user_id(request: Request) -> UUID:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AppError(401, "unauthorized", "Missing Bearer token")
    try:
        client = await _supabase()
        res = await client.auth.get_user(token.strip())
    except Exception:
        raise AppError(401, "unauthorized", "Invalid or expired token")
    if res is None or res.user is None:
        raise AppError(401, "unauthorized", "Invalid or expired token")
    return UUID(res.user.id)
