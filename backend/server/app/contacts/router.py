import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from app.activity import log_activity
from app.auth import get_user_id
from app.db import get_pool
from app.errors import AppError

router = APIRouter(prefix="/api/contacts", tags=["contacts"])
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    role: Literal["client", "contractor"]
    aliases: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL_RE.match(v):
            raise ValueError("invalid email address")
        return v


@router.post("", status_code=201)
async def create_contact(body: ContactIn, user_id: UUID = Depends(get_user_id)):
    aliases = [a.strip() for a in body.aliases if a.strip()]
    async with get_pool().connection() as conn:
        cur = await conn.execute(
            """insert into contacts (owner_id, name, email, role, aliases) values (%s, %s, %s, %s, %s)
               on conflict (owner_id, email) do nothing returning *""",
            (user_id, body.name.strip(), body.email, body.role, aliases),
        )
        row = await cur.fetchone()
        if row is None:
            raise AppError(409, "conflict", f"A contact with email {body.email} already exists")
        await log_activity(conn, owner_id=user_id, actor="user", event="contact.created",
                           message=f"Added contact {row['name']} ({row['role']})",
                           entity_type="contact", entity_id=row["id"])
    return {"contact": {**row, "id": str(row["id"]), "owner_id": str(row["owner_id"]),
                        "created_at": row["created_at"].isoformat()}}
