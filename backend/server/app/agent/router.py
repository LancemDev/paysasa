from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.agent.llm import LLM, get_llm
from app.agent.run import AgentFailed, run_agent
from app.auth import get_user_id
from app.config import get_settings
from app.db import get_pool
from app.deps import get_adapter
from app.errors import AppError
from app.paypal_contract import PayPalAdapter

router = APIRouter(prefix="/api/agent", tags=["agent"])


class MessageIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/message")
async def post_message(
    body: MessageIn,
    user_id: UUID = Depends(get_user_id),
    llm: LLM = Depends(get_llm),
    adapter: PayPalAdapter = Depends(get_adapter),
):
    try:
        run_id, reply = await run_agent(
            pool=get_pool(), llm=llm, adapter=adapter, owner_id=user_id, message=body.message.strip(),
            max_amount_minor=get_settings().max_amount_minor,
        )
    except AgentFailed as e:
        raise AppError(502, "agent_failed", f"The assistant could not finish (run {e.run_id}). Please try again.")
    return {"run_id": str(run_id), "reply": reply}


@router.get("/runs")
async def list_runs(limit: int = Query(20, ge=1, le=100), user_id: UUID = Depends(get_user_id)):
    async with get_pool().connection() as conn:
        cur = await conn.execute(
            """select id, user_message, reply, status, created_at from agent_runs
               where owner_id = %s order by created_at desc limit %s""",
            (user_id, limit),
        )
        rows = await cur.fetchall()
    return [{**r, "id": str(r["id"]), "created_at": r["created_at"].isoformat()} for r in rows]
