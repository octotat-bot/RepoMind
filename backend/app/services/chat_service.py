"""Conversation persistence: chats, messages and history."""

from __future__ import annotations

from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from database.base import new_id
from database.enums import MessageRole
from database.models.chat import Chat, Message

logger = get_logger(__name__)

_HISTORY_TURNS = 6
_TITLE_MAX_CHARS = 60


async def get_or_create_chat(
    session: AsyncSession,
    repository_id: str,
    user_id: str,
    chat_id: str | None = None,
) -> Chat:
    if chat_id:
        chat = await session.get(Chat, chat_id)
        if chat is None or chat.user_id != user_id or chat.repository_id != repository_id:
            raise NotFoundError("Conversation not found.")
        return chat

    existing = (
        await session.execute(
            select(Chat)
            .where(Chat.repository_id == repository_id, Chat.user_id == user_id)
            .order_by(desc(Chat.updated_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    chat = Chat(
        id=new_id(),
        repository_id=repository_id,
        user_id=user_id,
        title="New conversation",
    )
    session.add(chat)
    await session.commit()
    await session.refresh(chat)
    return chat


async def list_chats(session: AsyncSession, repository_id: str, user_id: str) -> list[Chat]:
    result = await session.execute(
        select(Chat)
        .where(Chat.repository_id == repository_id, Chat.user_id == user_id)
        .order_by(desc(Chat.updated_at))
    )
    return list(result.scalars().all())


async def list_user_chats(session: AsyncSession, user_id: str, limit: int = 50) -> list[Chat]:
    result = await session.execute(
        select(Chat)
        .where(Chat.user_id == user_id)
        .options(selectinload(Chat.repository))
        .order_by(desc(Chat.updated_at))
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_messages(session: AsyncSession, chat_id: str) -> list[Message]:
    result = await session.execute(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    )
    return list(result.scalars().all())


async def recent_turns(session: AsyncSession, chat_id: str) -> list[dict[str, str]]:
    """Return the tail of the conversation formatted for the LLM.

    Only the last few turns are replayed: local models have a modest context
    window, and the retrieved code needs most of it.
    """
    result = await session.execute(
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(desc(Message.created_at))
        .limit(_HISTORY_TURNS * 2)
    )
    messages = list(reversed(result.scalars().all()))
    return [
        {
            "role": "user" if message.role == MessageRole.USER else "assistant",
            "content": message.content,
        }
        for message in messages
        if message.role in (MessageRole.USER, MessageRole.ASSISTANT)
    ]


async def add_message(
    session: AsyncSession,
    chat: Chat,
    role: MessageRole,
    content: str,
    **fields: object,
) -> Message:
    message = Message(
        id=new_id(),
        chat_id=chat.id,
        role=role,
        content=content,
        citations=fields.get("citations") or [],
        related_files=fields.get("related_files") or [],
        reasoning=fields.get("reasoning"),
        confidence=fields.get("confidence"),
        latency_ms=int(fields.get("latency_ms") or 0),
        token_count=int(fields.get("token_count") or 0),
    )
    session.add(message)

    chat.message_count = (chat.message_count or 0) + 1
    if role == MessageRole.USER and chat.title == "New conversation":
        chat.title = _derive_title(content)

    await session.commit()
    await session.refresh(message)
    return message


def _derive_title(question: str) -> str:
    title = " ".join(question.strip().split())
    if len(title) <= _TITLE_MAX_CHARS:
        return title or "New conversation"
    return title[:_TITLE_MAX_CHARS].rsplit(" ", 1)[0] + "…"


async def delete_chat(session: AsyncSession, chat_id: str, user_id: str) -> None:
    chat = await session.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise NotFoundError("Conversation not found.")
    await session.delete(chat)
    await session.commit()


async def clear_messages(session: AsyncSession, chat_id: str, user_id: str) -> None:
    chat = await session.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise NotFoundError("Conversation not found.")
    await session.execute(delete(Message).where(Message.chat_id == chat_id))
    chat.message_count = 0
    await session.commit()


async def count_messages(session: AsyncSession, chat_id: str) -> int:
    result = await session.execute(
        select(func.count(Message.id)).where(Message.chat_id == chat_id)
    )
    return int(result.scalar() or 0)
