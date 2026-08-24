"""Chat, conversation history and Markdown export."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.api.deps import CurrentUser, OwnedRepository, SessionDep
from app.core.errors import ValidationError
from app.schemas.chat import (
    ChatDetailResponse,
    ChatHistoryItem,
    ChatRequest,
    ChatResponse,
    MessageResponse as ChatMessageResponse,
)
from app.schemas.common import MessageResponse
from app.services import chat_service, repo_service
from app.services.chat_stream import stream_answer
from database.enums import IndexStatus, MessageRole

router = APIRouter(tags=["chat"])


@router.get("/repo/{repo_id}/chat", response_model=ChatDetailResponse)
async def get_conversation(
    repository: OwnedRepository,
    user: CurrentUser,
    session: SessionDep,
    chat_id: str | None = Query(default=None, alias="chatId"),
) -> ChatDetailResponse:
    chat = await chat_service.get_or_create_chat(session, repository.id, user.id, chat_id)
    messages = await chat_service.get_messages(session, chat.id)
    return ChatDetailResponse(
        chat=ChatResponse.model_validate(chat),
        messages=[ChatMessageResponse.model_validate(message) for message in messages],
    )


@router.get("/repo/{repo_id}/chats", response_model=list[ChatResponse])
async def list_conversations(
    repository: OwnedRepository, user: CurrentUser, session: SessionDep
) -> list[ChatResponse]:
    chats = await chat_service.list_chats(session, repository.id, user.id)
    return [ChatResponse.model_validate(chat) for chat in chats]


@router.post("/repo/{repo_id}/chat")
async def chat(
    repo_id: str,
    payload: ChatRequest,
    user: CurrentUser,
    session: SessionDep,
) -> StreamingResponse:
    """Ask a question and stream the grounded answer as Server-Sent Events.

    POST rather than ``EventSource``/GET: questions run to 4000 characters,
    which does not fit reliably in a URL. The frontend consumes the stream with
    ``fetch`` and a ``ReadableStream`` reader.
    """
    repository = await repo_service.get_repository(session, user.id, repo_id)
    if repository.status != IndexStatus.READY:
        raise ValidationError(
            f"{repository.full_name} is not ready yet (status: {repository.status.value}). "
            "Wait for indexing to finish."
        )

    return StreamingResponse(
        stream_answer(
            repository_id=repository.id,
            repository_name=repository.full_name,
            user_id=user.id,
            chat_id=payload.chat_id,
            question=payload.message,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/chat/history", response_model=list[ChatHistoryItem])
async def chat_history(
    user: CurrentUser, session: SessionDep, limit: int = Query(default=50, ge=1, le=200)
) -> list[ChatHistoryItem]:
    chats = await chat_service.list_user_chats(session, user.id, limit)
    return [
        ChatHistoryItem(
            id=chat.id,
            title=chat.title,
            message_count=chat.message_count,
            repository_id=chat.repository_id,
            repository_full_name=chat.repository.full_name if chat.repository else None,
            updated_at=chat.updated_at,
        )
        for chat in chats
    ]


@router.delete("/chat/{chat_id}", response_model=MessageResponse)
async def delete_conversation(
    chat_id: str, user: CurrentUser, session: SessionDep
) -> MessageResponse:
    await chat_service.delete_chat(session, chat_id, user.id)
    return MessageResponse(message="Conversation deleted.")


@router.post("/chat/{chat_id}/clear", response_model=MessageResponse)
async def clear_conversation(
    chat_id: str, user: CurrentUser, session: SessionDep
) -> MessageResponse:
    await chat_service.clear_messages(session, chat_id, user.id)
    return MessageResponse(message="Conversation cleared.")


@router.get("/chat/{chat_id}/export", response_class=PlainTextResponse)
async def export_conversation(
    chat_id: str, user: CurrentUser, session: SessionDep
) -> PlainTextResponse:
    """Render a conversation as Markdown, citations included."""
    chat = await chat_service.get_or_create_chat(
        session,
        (await _repository_id_for(session, chat_id, user.id)),
        user.id,
        chat_id,
    )
    messages = await chat_service.get_messages(session, chat.id)

    lines = [f"# {chat.title}", "", f"_Exported from RepoMind · {len(messages)} messages_", ""]
    for message in messages:
        speaker = "You" if message.role == MessageRole.USER else "RepoMind"
        lines += [f"## {speaker}", "", message.content, ""]
        if message.citations:
            lines.append("**Citations**")
            lines += [
                f"- `{citation['filePath']}:{citation['startLine']}-{citation['endLine']}`"
                for citation in message.citations
            ]
            lines.append("")
        if message.confidence is not None and message.role == MessageRole.ASSISTANT:
            lines += [f"_Confidence: {message.confidence:.0%}_", ""]

    return PlainTextResponse(
        "\n".join(lines),
        headers={"Content-Disposition": f'attachment; filename="{chat.id}.md"'},
        media_type="text/markdown",
    )


async def _repository_id_for(session, chat_id: str, user_id: str) -> str:
    from app.core.errors import NotFoundError
    from database.models.chat import Chat

    chat = await session.get(Chat, chat_id)
    if chat is None or chat.user_id != user_id:
        raise NotFoundError("Conversation not found.")
    return chat.repository_id
