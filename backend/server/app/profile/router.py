from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.activity import log_activity
from app.auth import get_user_id
from app.db import get_pool
from app.errors import AppError
from app.money import MoneyError, check_currency

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    default_currency: str = Field(min_length=3, max_length=3)


def _profile_out(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "display_name": row["display_name"],
        "default_currency": row["default_currency"].strip(),
        "created_at": row["created_at"].isoformat(),
    }


@router.get("")
async def get_profile(user_id: UUID = Depends(get_user_id)):
    async with get_pool().connection() as conn:
        cur = await conn.execute(
            "select id, display_name, default_currency, created_at from profiles where id = %s",
            (user_id,),
        )
        row = await cur.fetchone()
        if row is None:
            raise AppError(404, "not_found", "Profile not found")
    return {"profile": _profile_out(row)}


@router.patch("")
async def update_profile(body: ProfileUpdate, user_id: UUID = Depends(get_user_id)):
    try:
        currency = check_currency(body.default_currency)
    except MoneyError as e:
        raise AppError(422, "invalid_request", str(e))
    async with get_pool().connection() as conn:
        cur = await conn.execute(
            "update profiles set default_currency = %s where id = %s returning id, display_name, default_currency, created_at",
            (currency, user_id),
        )
        row = await cur.fetchone()
        if row is None:
            raise AppError(404, "not_found", "Profile not found")
        await log_activity(
            conn,
            owner_id=user_id,
            actor="user",
            event="profile.updated",
            message=f"Default currency set to {currency}",
            entity_type=None,
            entity_id=None,
            details={"default_currency": currency},
        )
    return {"profile": _profile_out(row)}
