"""Repository request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel
from database.enums import IndexStatus


class ImportRequest(CamelModel):
    url: str = Field(min_length=3, max_length=512, examples=["https://github.com/vercel/next.js"])
    force: bool = False


class RepositoryResponse(CamelModel):
    id: str
    url: str
    owner: str
    name: str
    full_name: str
    description: str | None = None
    language: str | None = None
    default_branch: str
    stars: int
    forks: int

    status: IndexStatus
    progress: int
    status_message: str | None = None
    error_message: str | None = None

    file_count: int
    chunk_count: int
    total_bytes: int
    line_count: int
    indexed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IndexRecordResponse(CamelModel):
    provider: str
    embedding_model: str
    dimension: int
    metric: str
    vector_count: int
    size_bytes: int
    build_duration_ms: int


class RepositoryDetailResponse(CamelModel):
    repository: RepositoryResponse
    index: IndexRecordResponse | None = None
    languages: list[dict[str, Any]] = Field(default_factory=list)


class ProgressResponse(CamelModel):
    repository_id: str
    status: IndexStatus
    progress: int
    message: str
    detail: str | None = None
    error: str | None = None


class FileNode(CamelModel):
    name: str
    path: str
    type: Literal["file", "directory"]
    language: str | None = None
    size: int | None = None
    children: list["FileNode"] = Field(default_factory=list)


class FileTreeResponse(CamelModel):
    tree: FileNode
    file_count: int


class FileContentResponse(CamelModel):
    path: str
    name: str
    language: str
    size_bytes: int
    line_count: int
    content: str
