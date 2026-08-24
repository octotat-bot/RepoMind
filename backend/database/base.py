"""Engine, session factory and the declarative base.

The same models run on Postgres (production/Docker) and SQLite (zero-setup local
development); SQLAlchemy transparently degrades native enums to VARCHAR + CHECK
on SQLite.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData, String, event
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.config import settings

# Explicit naming conventions keep Alembic/Prisma diffs stable across engines.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(AsyncAttrs, DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class UUIDPrimaryKey:
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


def _engine_kwargs() -> dict[str, object]:
    if settings.is_sqlite:
        # SQLite has no real pool; keep it simple and let aiosqlite serialise.
        return {}
    return {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True, "pool_recycle": 1800}


engine = create_async_engine(
    settings.database_url,
    echo=settings.db_echo,
    future=True,
    **_engine_kwargs(),
)

if settings.is_sqlite:
    # SQLite ignores foreign keys unless asked. Deletes rely on ON DELETE
    # CASCADE (see passive_deletes on the models), so this is required for
    # correctness, not just integrity.
    @event.listens_for(engine.sync_engine, "connect")
    def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a transactional session."""
    async with SessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
