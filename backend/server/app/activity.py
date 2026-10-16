import json
from uuid import UUID

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb


async def log_activity(
    conn: AsyncConnection, *, owner_id: UUID, actor: str, event: str, message: str,
    entity_type: str | None = None, entity_id: UUID | None = None, details: dict | None = None,
) -> None:
    await conn.execute(
        """insert into activity_log (owner_id, actor, event, message, entity_type, entity_id, details)
           values (%s, %s, %s, %s, %s, %s, %s)""",
        (owner_id, actor, event, message, entity_type, entity_id,
         Jsonb(json.loads(json.dumps(details or {}, default=str)))),
    )
