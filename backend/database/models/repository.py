"""Repository model — one row per imported GitHub repository."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base, Timestamps, UUIDPrimaryKey
from database.enums import IndexStatus
from database.types import enum_column

if TYPE_CHECKING:
    from database.models.chat import Chat
    from database.models.code import CodeChunk, IndexRecord, RepositoryFile
    from database.models.user import User


class Repository(Base, UUIDPrimaryKey, Timestamps):
    __tablename__ = "repositories"
    __table_args__ = (
        UniqueConstraint("user_id", "full_name", name="uq_repository_owner_name"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # ── GitHub identity ─────────────────────────────────────────────────────
    url: Mapped[str] = mapped_column(String(512), nullable=False)
    owner: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    full_name: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_branch: Mapped[str] = mapped_column(String(120), default="main", nullable=False)
    language: Mapped[str | None] = mapped_column(String(60), nullable=True)
    stars: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    forks: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # ── Indexing state ──────────────────────────────────────────────────────
    status: Mapped[IndexStatus] = mapped_column(
        enum_column(IndexStatus, "index_status"),
        default=IndexStatus.QUEUED,
        nullable=False,
        index=True,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status_message: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Statistics ──────────────────────────────────────────────────────────
    file_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="repositories")

    # These collections are never traversed in Python — they exist to declare
    # the relationship. passive_deletes hands cascading to the database FKs so
    # deleting a repository never has to load thousands of chunk rows.
    files: Mapped[list["RepositoryFile"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    chunks: Mapped[list["CodeChunk"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    chats: Mapped[list["Chat"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )
    # Eager: a single row that the detail endpoint always renders.
    index_record: Mapped["IndexRecord | None"] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
        lazy="selectin",
    )

    @property
    def slug(self) -> str:
        return f"{self.owner}/{self.name}"

    def __repr__(self) -> str:
        return f"<Repository {self.full_name} status={self.status}>"
