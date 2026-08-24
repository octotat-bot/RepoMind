"""Source-file, chunk and vector-index models."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from database.models.repository import Repository


class RepositoryFile(Base, UUIDPrimaryKey, Timestamps):
    """A single ingested source file.

    ``content`` is normally left empty because the clone on disk is the source
    of truth. It is populated only when the host has an ephemeral filesystem, so
    the working tree can be rebuilt after the disk is wiped.
    """

    __tablename__ = "repository_files"
    __table_args__ = (
        Index("ix_repository_files_repo_path", "repository_id", "path", unique=True),
    )

    repository_id: Mapped[str] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    path: Mapped[str] = mapped_column(String(1024), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    extension: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    language: Mapped[str] = mapped_column(String(60), default="text", nullable=False, index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    line_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)

    repository: Mapped["Repository"] = relationship(back_populates="files", lazy="raise")
    chunks: Mapped[list["CodeChunk"]] = relationship(
        back_populates="file",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<RepositoryFile {self.path}>"


class CodeChunk(Base, UUIDPrimaryKey, Timestamps):
    """A retrievable slice of a file.

    ``vector_id`` is the row offset of this chunk's embedding inside the
    repository's FAISS index, which is how a similarity hit maps back to source.

    ``embedding`` holds that vector as raw float32 bytes. Storing it costs about
    3 KB per chunk and means the FAISS index is a derived artefact: it can be
    rebuilt in milliseconds after a restart wipes the disk, with no re-embedding
    and no calls to the model.
    """

    __tablename__ = "code_chunks"
    __table_args__ = (
        Index("ix_code_chunks_repo_vector", "repository_id", "vector_id", unique=True),
    )

    repository_id: Mapped[str] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        ForeignKey("repository_files.id", ondelete="CASCADE"), index=True, nullable=False
    )
    vector_id: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    language: Mapped[str] = mapped_column(String(60), default="text", nullable=False)
    start_line: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    end_line: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    symbols: Mapped[str | None] = mapped_column(Text, nullable=True)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    repository: Mapped["Repository"] = relationship(back_populates="chunks", lazy="raise")
    file: Mapped["RepositoryFile"] = relationship(back_populates="chunks", lazy="raise")

    def __repr__(self) -> str:
        return f"<CodeChunk {self.file_path}:{self.start_line}-{self.end_line}>"


class IndexRecord(Base, UUIDPrimaryKey, Timestamps):
    """Bookkeeping for the on-disk FAISS index backing one repository."""

    __tablename__ = "indexes"

    repository_id: Mapped[str] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(60), default="faiss", nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(120), nullable=False)
    dimension: Mapped[int] = mapped_column(Integer, nullable=False)
    metric: Mapped[str] = mapped_column(String(32), default="cosine", nullable=False)
    vector_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    index_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    build_duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    repository: Mapped["Repository"] = relationship(
        back_populates="index_record", lazy="raise"
    )

    def __repr__(self) -> str:
        return f"<IndexRecord repo={self.repository_id} vectors={self.vector_count}>"
