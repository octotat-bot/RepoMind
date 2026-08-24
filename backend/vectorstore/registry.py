"""Lazily-loaded, in-process cache of per-repository FAISS indexes.

Reading an index off disk costs real milliseconds, so a repository's index is
loaded once on first query and then reused for the lifetime of the process.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.config import settings
from app.core.logging import get_logger
from vectorstore.faiss_store import FaissStore

logger = get_logger(__name__)

_cache: dict[str, FaissStore] = {}
_locks: dict[str, asyncio.Lock] = {}


def index_directory(repository_id: str) -> Path:
    return settings.faiss_dir / repository_id


def _lock_for(repository_id: str) -> asyncio.Lock:
    if repository_id not in _locks:
        _locks[repository_id] = asyncio.Lock()
    return _locks[repository_id]


async def get_store(repository_id: str) -> FaissStore | None:
    """Return the repository's index, loading it from disk on first use."""
    if repository_id in _cache:
        return _cache[repository_id]

    async with _lock_for(repository_id):
        if repository_id in _cache:  # another coroutine won the race
            return _cache[repository_id]

        directory = index_directory(repository_id)
        store = await asyncio.to_thread(FaissStore.load, directory)
        if store is not None:
            _cache[repository_id] = store
            logger.info("Loaded index for %s (%d vectors)", repository_id, store.size)
        return store


def put_store(repository_id: str, store: FaissStore) -> None:
    _cache[repository_id] = store


def evict(repository_id: str) -> None:
    _cache.pop(repository_id, None)
    _locks.pop(repository_id, None)


async def delete_index(repository_id: str) -> None:
    evict(repository_id)
    await asyncio.to_thread(FaissStore.destroy, index_directory(repository_id))


def clear_cache() -> None:
    _cache.clear()
    _locks.clear()
