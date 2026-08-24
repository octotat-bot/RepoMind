"""Enumerations shared by the ORM, the API schemas and the Prisma schema.

Member names and values are identical so the persisted representation is the
same regardless of which layer writes the row.
"""

from __future__ import annotations

from enum import Enum


class IndexStatus(str, Enum):
    """Lifecycle of a repository's index. Ordered to match pipeline progress."""

    QUEUED = "QUEUED"
    CLONING = "CLONING"
    PARSING = "PARSING"
    CHUNKING = "CHUNKING"
    EMBEDDING = "EMBEDDING"
    INDEXING = "INDEXING"
    READY = "READY"
    FAILED = "FAILED"

    @property
    def is_terminal(self) -> bool:
        return self in {IndexStatus.READY, IndexStatus.FAILED}

    @property
    def is_active(self) -> bool:
        return not self.is_terminal


class MessageRole(str, Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"
    SYSTEM = "SYSTEM"


class FindingKind(str, Enum):
    """Categories emitted by the dead-code analyser."""

    UNUSED_EXPORT = "UNUSED_EXPORT"
    UNREFERENCED_FILE = "UNREFERENCED_FILE"
    DUPLICATE_UTILITY = "DUPLICATE_UTILITY"
    UNUSED_IMPORT = "UNUSED_IMPORT"


class Severity(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
