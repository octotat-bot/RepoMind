"""The Prisma schema and the SQLAlchemy models must describe the same database.

Prisma owns migrations; SQLAlchemy owns runtime access. Nothing forces them to
agree, so drift is silent until a query fails in production. This test compares
them directly.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from database.base import Base
from database.enums import IndexStatus, MessageRole

# Importing the models registers them on Base.metadata.
import database.models  # noqa: F401

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "database" / "prisma" / "schema.prisma"

_MODEL_BLOCK = re.compile(r"^model\s+(\w+)\s*\{(.*?)^\}", re.MULTILINE | re.DOTALL)
_ENUM_BLOCK = re.compile(r"^enum\s+(\w+)\s*\{(.*?)^\}", re.MULTILINE | re.DOTALL)
_TABLE_MAP = re.compile(r'@@map\("([^"]+)"\)')
_COLUMN_MAP = re.compile(r'@map\("([^"]+)"\)')
# Relation fields have no scalar column of their own.
_RELATION = re.compile(r"@relation\(")


@pytest.fixture(scope="module")
def prisma_source() -> str:
    assert SCHEMA_PATH.exists(), f"Prisma schema not found at {SCHEMA_PATH}"
    return SCHEMA_PATH.read_text()


def parse_prisma_tables(source: str) -> dict[str, set[str]]:
    """Map each Prisma model to the set of physical column names it declares."""
    tables: dict[str, set[str]] = {}

    for model_name, body in _MODEL_BLOCK.findall(source):
        table_match = _TABLE_MAP.search(body)
        table = table_match.group(1) if table_match else model_name.lower()

        columns: set[str] = set()
        for raw_line in body.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("//") or line.startswith("@@"):
                continue

            parts = line.split()
            if len(parts) < 2:
                continue

            field, field_type = parts[0], parts[1]
            if _RELATION.search(line):
                continue
            # A bare model-typed field (e.g. `indexRecord IndexRecord?`) is the
            # inverse side of a relation and has no column.
            if field_type.rstrip("?[]") in {name for name, _ in _MODEL_BLOCK.findall(source)}:
                continue

            column_match = _COLUMN_MAP.search(line)
            columns.add(column_match.group(1) if column_match else field)

        tables[table] = columns

    return tables


def parse_prisma_enums(source: str) -> dict[str, set[str]]:
    enums: dict[str, set[str]] = {}
    for enum_name, body in _ENUM_BLOCK.findall(source):
        values = {
            line.strip()
            for line in body.splitlines()
            if line.strip() and not line.strip().startswith(("//", "@@"))
        }
        enums[enum_name] = values
    return enums


def test_every_sqlalchemy_table_exists_in_prisma(prisma_source: str) -> None:
    prisma_tables = parse_prisma_tables(prisma_source)
    sqlalchemy_tables = set(Base.metadata.tables)

    missing = sqlalchemy_tables - set(prisma_tables)
    assert not missing, f"Tables missing from the Prisma schema: {sorted(missing)}"


def test_no_extra_prisma_tables(prisma_source: str) -> None:
    prisma_tables = parse_prisma_tables(prisma_source)
    extra = set(prisma_tables) - set(Base.metadata.tables)
    assert not extra, f"Prisma declares tables the backend does not map: {sorted(extra)}"


@pytest.mark.parametrize(
    "table_name",
    ["users", "repositories", "repository_files", "code_chunks", "indexes", "chats", "messages"],
)
def test_columns_match(prisma_source: str, table_name: str) -> None:
    prisma_columns = parse_prisma_tables(prisma_source)[table_name]
    sqlalchemy_columns = {column.name for column in Base.metadata.tables[table_name].columns}

    missing_in_prisma = sqlalchemy_columns - prisma_columns
    missing_in_sqlalchemy = prisma_columns - sqlalchemy_columns

    assert not missing_in_prisma, (
        f"{table_name}: columns in SQLAlchemy but not Prisma: {sorted(missing_in_prisma)}"
    )
    assert not missing_in_sqlalchemy, (
        f"{table_name}: columns in Prisma but not SQLAlchemy: {sorted(missing_in_sqlalchemy)}"
    )


def test_enum_values_match(prisma_source: str) -> None:
    enums = parse_prisma_enums(prisma_source)

    assert enums["IndexStatus"] == {status.value for status in IndexStatus}
    assert enums["MessageRole"] == {role.value for role in MessageRole}
