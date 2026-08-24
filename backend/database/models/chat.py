"""Conversation models — each repository owns an independent chat history."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base, Timestamps, UUIDPrimaryKey
from database.enums import MessageRole
from database.types import JSONColumn, enum_column

if TYPE_CHECKING:
    from database.models.repository import Repository
    from database.models.user import User


class Chat(Base, UUIDPrimaryKey, Timestamps):
    __tablename__ = "chats"

    repository_id: Mapped[str] = mapped_column(
        ForeignKey("repositories.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), default="New conversation", nullable=False)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    repository: Mapped["Repository"] = relationship(back_populates="chats", lazy="raise")
    user: Mapped["User"] = relationship(back_populates="chats", lazy="raise")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="chat",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Message.created_at",
        lazy="raise",
    )

    def __repr__(self) -> str:
        return f"<Chat {self.id} {self.title!r}>"


class Message(Base, UUIDPrimaryKey, Timestamps):
    """A single turn.

    Assistant turns additionally persist the retrieval evidence — citations and
    related files — so a reloaded conversation renders exactly as it streamed.
    """

    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_chat_created", "chat_id", "created_at"),)

    chat_id: Mapped[str] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[MessageRole] = mapped_column(
        enum_column(MessageRole, "message_role"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONColumn, default=list, nullable=False
    )
    related_files: Mapped[list[str]] = mapped_column(JSONColumn, default=list, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    chat: Mapped["Chat"] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message {self.role} {len(self.content)} chars>"
