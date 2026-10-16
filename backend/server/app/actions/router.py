from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.actions import service
from app.auth import get_user_id
from app.db import get_pool
from app.deps import get_adapter
from app.paypal_contract import PayPalAdapter

router = APIRouter(prefix="/api/actions", tags=["actions"])


class ApproveIn(BaseModel):
    message: str | None = Field(default=None, max_length=2000)


class RejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.post("/{action_id}/approve")
async def approve(action_id: UUID, body: ApproveIn | None = None, user_id: UUID = Depends(get_user_id),
                  adapter: PayPalAdapter = Depends(get_adapter)):
    action = await service.approve(get_pool(), adapter, action_id=action_id, owner_id=user_id,
                                   message=body.message if body else None)
    return {"action": action}


@router.post("/{action_id}/reject")
async def reject(action_id: UUID, body: RejectIn | None = None, user_id: UUID = Depends(get_user_id)):
    action = await service.reject(get_pool(), action_id=action_id, owner_id=user_id,
                                  reason=body.reason if body else None)
    return {"action": action}
