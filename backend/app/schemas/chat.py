"""Chat request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import Field

from app.schemas.common import CamelModel
from database.enums import MessageRole


class ChatRequest(CamelModel):
    message: str = Field(min_length=1, max_length=4000)
    chat_id: str | None = None


class CitationResponse(CamelModel):
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    language: str
    snippet: str
    score: float
    number: int


class MessageResponse(CamelModel):
    id: str
    role: MessageRole
    content: str
    reasoning: str | None = None
    confidence: float | None = None
    citations: list[dict[str, Any]] = Field(default_factory=list)
    related_files: list[str] = Field(default_factory=list)
    latency_ms: int = 0
    token_count: int = 0
    created_at: datetime


class ChatResponse(CamelModel):
    id: str
    repository_id: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class ChatDetailResponse(CamelModel):
    chat: ChatResponse
    messages: list[MessageResponse] = Field(default_factory=list)


class ChatHistoryItem(CamelModel):
    id: str
    title: str
    message_count: int
    repository_id: str
    repository_full_name: str | None = None
    updated_at: datetime


class SearchRequest(CamelModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=12, ge=1, le=50)
    group_by_file: bool = True
