"""Reusable column types."""

from __future__ import annotations

from enum import Enum as PyEnum

from sqlalchemy import Enum as SAEnum
from sqlalchemy.types import JSON


def enum_column(enum_cls: type[PyEnum], name: str) -> SAEnum:
    """Persist the enum *value* (not the member name) under a stable type name.

    Postgres gets a native ENUM type; SQLite falls back to VARCHAR + CHECK.
    """
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda enum: [member.value for member in enum],
        native_enum=True,
        validate_strings=True,
    )


# JSON is portable across Postgres (JSONB via dialect) and SQLite.
JSONColumn = JSON
