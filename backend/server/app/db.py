"""psycopg 3 async connection pool. Every write path takes a connection and runs in a transaction."""
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

_pool: AsyncConnectionPool | None = None


def make_pool(database_url: str, **kwargs) -> AsyncConnectionPool:
    # prepare_threshold=None keeps us compatible with Supabase's transaction-mode pooler.
    return AsyncConnectionPool(
        database_url,
        open=False,
        kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": False},
        **kwargs,
    )


async def open_pool(database_url: str, **kwargs) -> AsyncConnectionPool:
    global _pool
    if _pool is None:
        _pool = make_pool(database_url, **kwargs)
        await _pool.open(wait=True)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> AsyncConnectionPool:
    if _pool is None:
        raise RuntimeError("Database pool is not open")
    return _pool
