"""In-process pub/sub used to stream indexing progress to the browser.

Deliberately in-memory: progress is ephemeral UI state, and the authoritative
status always lands in Postgres. A late subscriber immediately receives the last
known event so a page refresh mid-index still shows the right bar.

A multi-worker deployment would swap this for Redis pub/sub; the interface is
narrow enough that only this file changes.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

from app.core.logging import get_logger
from database.enums import IndexStatus

logger = get_logger(__name__)

_QUEUE_MAXSIZE = 64


@dataclass
class ProgressEvent:
    repository_id: str
    status: IndexStatus
    progress: int
    message: str
    detail: str | None = None
    error: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict:
        payload = asdict(self)
        payload["status"] = self.status.value
        return {
            "repositoryId": payload["repository_id"],
            "status": payload["status"],
            "progress": payload["progress"],
            "message": payload["message"],
            "detail": payload["detail"],
            "error": payload["error"],
            "timestamp": payload["timestamp"],
        }


_subscribers: dict[str, list[asyncio.Queue[ProgressEvent]]] = {}
_last_event: dict[str, ProgressEvent] = {}


def publish(event: ProgressEvent) -> None:
    _last_event[event.repository_id] = event
    for queue in list(_subscribers.get(event.repository_id, [])):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # A slow client must never stall the indexing pipeline.
            logger.debug("Dropping progress event for a slow subscriber")


def last_event(repository_id: str) -> ProgressEvent | None:
    return _last_event.get(repository_id)


async def subscribe(repository_id: str) -> AsyncIterator[ProgressEvent]:
    """Yield progress events until the repository reaches a terminal state."""
    queue: asyncio.Queue[ProgressEvent] = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
    _subscribers.setdefault(repository_id, []).append(queue)

    try:
        if (previous := _last_event.get(repository_id)) is not None:
            yield previous
            if previous.status.is_terminal:
                return

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30.0)
            except TimeoutError:
                # Keep the SSE connection warm through proxies during long steps.
                current = _last_event.get(repository_id)
                if current is None:
                    continue
                yield current
                if current.status.is_terminal:
                    return
                continue

            yield event
            if event.status.is_terminal:
                return
    finally:
        queues = _subscribers.get(repository_id, [])
        if queue in queues:
            queues.remove(queue)
        if not queues:
            _subscribers.pop(repository_id, None)


def forget(repository_id: str) -> None:
    _subscribers.pop(repository_id, None)
    _last_event.pop(repository_id, None)
