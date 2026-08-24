"""Streaming RAG orchestration.

Emits Server-Sent Events in a fixed order: ``context`` (so the retrieved-files
panel fills in before the first token), then ``token`` deltas, then a final
``done`` carrying the persisted message with citations and confidence.
"""

from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator

from ai.answer import analyse
from ai.llm import get_chat_model
from ai.prompts import ANSWER_TEMPLATE, NO_CONTEXT_TEMPLATE, SYSTEM_PROMPT
from ai.retrieval import build_context, retrieve
from app.core.errors import RepoMindError
from app.core.logging import get_logger
from app.services import chat_service
from database.base import SessionFactory
from database.enums import MessageRole
from ingest.tokens import estimate_tokens

logger = get_logger(__name__)


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_answer(
    repository_id: str,
    repository_name: str,
    user_id: str,
    chat_id: str,
    question: str,
) -> AsyncIterator[str]:
    """Yield SSE frames for one question.

    Opens its own session because FastAPI closes ``yield`` dependencies before
    a StreamingResponse body is consumed.
    """
    started = time.perf_counter()

    try:
        async with SessionFactory() as session:
            chat = await chat_service.get_or_create_chat(
                session, repository_id, user_id, chat_id
            )
            await chat_service.add_message(session, chat, MessageRole.USER, question)
            history = await chat_service.recent_turns(session, chat.id)

            # ── Retrieve ────────────────────────────────────────────────────
            chunks = await retrieve(session, repository_id, question)
            yield sse("context", {
                "chunks": [chunk.to_dict() for chunk in chunks],
                "chatId": chat.id,
            })

            # ── Prompt ──────────────────────────────────────────────────────
            if chunks:
                user_prompt = ANSWER_TEMPLATE.format(
                    repository=repository_name,
                    context=build_context(chunks),
                    question=question,
                )
            else:
                user_prompt = NO_CONTEXT_TEMPLATE.format(
                    repository=repository_name, question=question
                )

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                # Replay prior turns, minus the question we just stored.
                *history[:-1][-6:],
                {"role": "user", "content": user_prompt},
            ]

            # ── Generate ────────────────────────────────────────────────────
            client = get_chat_model()
            pieces: list[str] = []
            async for token in client.stream_chat(messages):
                pieces.append(token)
                yield sse("token", {"value": token})

            answer = "".join(pieces).strip()
            if not answer:
                answer = "I was not able to generate an answer. Please try rephrasing."

            # ── Analyse and persist ─────────────────────────────────────────
            analysis = analyse(answer, chunks)
            latency_ms = int((time.perf_counter() - started) * 1000)

            message = await chat_service.add_message(
                session,
                chat,
                MessageRole.ASSISTANT,
                answer,
                citations=[citation.to_dict() for citation in analysis.citations],
                related_files=analysis.related_files,
                reasoning=analysis.reasoning,
                confidence=analysis.confidence,
                latency_ms=latency_ms,
                token_count=estimate_tokens(answer),
            )

            yield sse("done", {
                "messageId": message.id,
                "chatId": chat.id,
                "content": answer,
                "latencyMs": latency_ms,
                **analysis.to_dict(),
            })

    except RepoMindError as exc:
        logger.warning("Chat stream failed: %s", exc.message)
        yield sse("error", {"code": exc.code, "message": exc.message})
    except Exception as exc:  # noqa: BLE001 - the stream must always terminate cleanly
        logger.exception("Unexpected chat stream failure")
        yield sse("error", {
            "code": "internal_error",
            "message": f"Something went wrong while answering: {exc}",
        })
