"""Schema lifecycle helpers.

``create_all`` is used for local development and tests. Postgres deployments
should apply the Prisma migrations in ``database/prisma`` instead, which produce
an identical schema.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from app.core.logging import get_logger
from database import models  # noqa: F401  (registers mappers on Base.metadata)
from database.base import Base, engine

logger = get_logger(__name__)

# Columns added after the first release.
#
# ``create_all`` creates missing *tables* but never alters existing ones, so a
# database created by an earlier version keeps its old shape and every query
# touching a new column fails with "no such column". These are all nullable and
# additive, which makes applying them in place safe and idempotent.
#
# (table, column, sqlite type, postgres type)
_ADDITIVE_COLUMNS: list[tuple[str, str, str, str]] = [
    ("repository_files", "content", "TEXT", "TEXT"),
    ("code_chunks", "embedding", "BLOB", "BYTEA"),
]


def _existing_columns(sync_connection) -> dict[str, set[str]]:
    inspector = inspect(sync_connection)
    return {
        table: {column["name"] for column in inspector.get_columns(table)}
        for table in inspector.get_table_names()
    }


async def _apply_additive_columns() -> None:
    async with engine.begin() as connection:
        is_postgres = connection.dialect.name == "postgresql"
        existing = await connection.run_sync(_existing_columns)

        for table, column, sqlite_type, postgres_type in _ADDITIVE_COLUMNS:
            if table not in existing or column in existing[table]:
                continue

            column_type = postgres_type if is_postgres else sqlite_type
            await connection.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
            )
            logger.info("Added missing column %s.%s", table, column)


async def init_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await _apply_additive_columns()
    logger.info("Database schema ready (%d tables)", len(Base.metadata.tables))


async def drop_database() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    logger.warning("Database schema dropped")


async def dispose_engine() -> None:
    await engine.dispose()
