"""Rebuild on-disk state from the database.

Free hosting tiers give you an ephemeral filesystem: the disk is wiped on every
restart, redeploy and idle spin-down. Re-cloning and re-embedding on each cold
start would be slow and would burn API quota, so when ``EPHEMERAL_FILESYSTEM`` is
on, indexing also writes the two things needed to reconstruct that state — the
embedding vectors and the file text — into Postgres.

Everything here is idempotent and cheap: rebuilding a 450-chunk index is a few
milliseconds of numpy, not a re-index.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from database.base import SessionFactory
from database.models.code import CodeChunk, IndexRecord, RepositoryFile
from ingest.git_clone import repo_workdir
from vectorstore import registry
from vectorstore.faiss_store import FaissStore

logger = get_logger(__name__)

_workdir_locks: dict[str, asyncio.Lock] = {}


def _lock_for(repository_id: str) -> asyncio.Lock:
    if repository_id not in _workdir_locks:
        _workdir_locks[repository_id] = asyncio.Lock()
    return _workdir_locks[repository_id]


# ── Vectors ──────────────────────────────────────────────────────────────────

def vector_to_bytes(vector: np.ndarray) -> bytes:
    return np.asarray(vector, dtype="float32").tobytes()


def bytes_to_vector(blob: bytes, dimension: int) -> np.ndarray:
    return np.frombuffer(blob, dtype="float32").reshape(dimension)


async def rebuild_index(session: AsyncSession, repository_id: str) -> FaissStore | None:
    """Reconstruct a repository's FAISS index from the vectors stored in the DB.

    Returns ``None`` when the rows carry no embeddings, which is the case for
    repositories indexed while the feature was off — those need a re-index.
    """
    record = (
        await session.execute(
            select(IndexRecord).where(IndexRecord.repository_id == repository_id)
        )
    ).scalar_one_or_none()
    if record is None:
        return None

    rows = (
        await session.execute(
            select(CodeChunk.id, CodeChunk.embedding)
            .where(CodeChunk.repository_id == repository_id)
            .order_by(CodeChunk.vector_id)
        )
    ).all()

    usable = [(chunk_id, blob) for chunk_id, blob in rows if blob]
    if not usable:
        logger.warning(
            "No stored vectors for %s; it must be re-indexed to be queryable.",
            repository_id,
        )
        return None

    dimension = record.dimension
    vectors = np.vstack([bytes_to_vector(blob, dimension) for _, blob in usable])

    store = FaissStore(
        directory=registry.index_directory(repository_id),
        dimension=dimension,
        model_name=record.embedding_model,
    )
    store.add(vectors, [chunk_id for chunk_id, _ in usable])
    registry.put_store(repository_id, store)

    logger.info("Rebuilt index for %s from the database (%d vectors)", repository_id, store.size)
    return store


async def ensure_index(repository_id: str) -> FaissStore | None:
    """Return the repository's index, rebuilding it from the DB if the disk is empty."""
    store = await registry.get_store(repository_id)
    if store is not None and store.size:
        return store

    async with SessionFactory() as session:
        return await rebuild_index(session, repository_id)


# ── Working tree ─────────────────────────────────────────────────────────────

async def ensure_workdir(repository_id: str) -> Path | None:
    """Return a working tree for the repository, materialising it if needed.

    The architecture, dead-code and file-viewer features all read real files, so
    rather than teaching each of them to read from the database, the checkout is
    written back to disk once and every existing code path keeps working.
    """
    workdir = repo_workdir(repository_id)
    if workdir.exists() and any(workdir.iterdir()):
        return workdir

    async with _lock_for(repository_id):
        if workdir.exists() and any(workdir.iterdir()):
            return workdir

        async with SessionFactory() as session:
            rows = (
                await session.execute(
                    select(RepositoryFile.path, RepositoryFile.content).where(
                        RepositoryFile.repository_id == repository_id
                    )
                )
            ).all()

        materialisable = [(path, content) for path, content in rows if content is not None]
        if not materialisable:
            return None

        await asyncio.to_thread(_write_tree, workdir, materialisable)
        logger.info(
            "Restored %d files for %s from the database", len(materialisable), repository_id
        )
        return workdir


def _write_tree(workdir: Path, files: list[tuple[str, str]]) -> None:
    for relative_path, content in files:
        target = workdir / relative_path
        # Defensive: paths come from our own ingestion, but a rogue row must not
        # be able to write outside the working directory.
        if not target.resolve().is_relative_to(workdir.resolve()):
            logger.warning("Skipping suspicious stored path %r", relative_path)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def should_persist_content() -> bool:
    """Whether indexing should also write file text and vectors to the database."""
    return settings.ephemeral_filesystem
