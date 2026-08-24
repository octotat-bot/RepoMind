"""The end-to-end indexing pipeline.

clone → discover → chunk → embed → FAISS → Postgres, reporting progress at each
stage. Runs as a background task so the import request returns immediately.
"""

from __future__ import annotations

import asyncio
import time

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services.index_rows import (
    build_chunk_rows,
    chunk_all,
    persist_files,
    write_index_record,
)
from app.services.progress import ProgressEvent, publish
from app.services.rehydrate import should_persist_content
from database.base import SessionFactory, utcnow
from database.enums import IndexStatus
from database.models.repository import Repository
from embeddings.factory import get_embedder
from ingest.chunker import Chunk, build_embedding_text
from ingest.file_walker import discover_files
from ingest.git_clone import clone_repository, repo_workdir
from ingest.github import RepoRef
from vectorstore import registry
from vectorstore.faiss_store import FaissStore

logger = get_logger(__name__)

# Progress checkpoints per stage, so the bar advances smoothly and predictably.
_STAGE_PROGRESS = {
    IndexStatus.QUEUED: 2,
    IndexStatus.CLONING: 10,
    IndexStatus.PARSING: 25,
    IndexStatus.CHUNKING: 40,
    IndexStatus.EMBEDDING: 55,   # 55 → 90 as batches complete
    IndexStatus.INDEXING: 92,
    IndexStatus.READY: 100,
}

_semaphore: asyncio.Semaphore | None = None


def _concurrency_gate() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        from app.core.config import settings

        _semaphore = asyncio.Semaphore(settings.max_concurrent_indexing_jobs)
    return _semaphore


async def _report(
    session: AsyncSession,
    repository: Repository,
    status: IndexStatus,
    message: str,
    *,
    progress: int | None = None,
    detail: str | None = None,
    error: str | None = None,
) -> None:
    repository.status = status
    repository.progress = progress if progress is not None else _STAGE_PROGRESS.get(status, 0)
    repository.status_message = message
    if error:
        repository.error_message = error
    await session.commit()

    publish(
        ProgressEvent(
            repository_id=repository.id,
            status=status,
            progress=repository.progress,
            message=message,
            detail=detail,
            error=error,
        )
    )


async def run_indexing_job(repository_id: str, ref: RepoRef) -> None:
    """Entry point for the background task; owns its own DB session."""
    async with _concurrency_gate():
        async with SessionFactory() as session:
            repository = await session.get(Repository, repository_id)
            if repository is None:
                logger.error("Repository %s vanished before indexing", repository_id)
                return
            try:
                await _execute(session, repository, ref)
            except Exception as exc:  # noqa: BLE001 - surfaced to the user
                logger.exception("Indexing failed for %s", repository.full_name)
                await _report(
                    session,
                    repository,
                    IndexStatus.FAILED,
                    "Indexing failed",
                    progress=repository.progress,
                    error=str(exc),
                )


async def _execute(session: AsyncSession, repository: Repository, ref: RepoRef) -> None:
    started = time.perf_counter()

    # ── 1. Clone ────────────────────────────────────────────────────────────
    await _report(session, repository, IndexStatus.CLONING, f"Cloning {ref.full_name}…")
    workdir = repo_workdir(repository.id)
    await clone_repository(ref, workdir)

    # ── 2. Discover files ───────────────────────────────────────────────────
    await _report(session, repository, IndexStatus.PARSING, "Reading the file tree…")
    files = await asyncio.to_thread(discover_files, workdir)
    if not files:
        raise ValueError(
            "No supported source files were found. The repository may contain "
            "only binaries or unsupported languages."
        )
    await _report(
        session,
        repository,
        IndexStatus.PARSING,
        f"Found {len(files)} source files",
        detail=f"{len(files)} files",
    )

    # ── 3. Chunk ────────────────────────────────────────────────────────────
    await _report(session, repository, IndexStatus.CHUNKING, "Chunking source files…")
    store_content = should_persist_content()
    file_rows, chunks = await asyncio.to_thread(
        chunk_all, repository.id, workdir, files, store_content
    )
    if not chunks:
        raise ValueError("Chunking produced no content to index.")

    await persist_files(session, repository, file_rows)
    await _report(
        session,
        repository,
        IndexStatus.CHUNKING,
        f"Created {len(chunks)} chunks",
        detail=f"{len(chunks)} chunks",
    )

    # ── 4. Embed ────────────────────────────────────────────────────────────
    embedder = get_embedder()
    vectors = await _embed_chunks(session, repository, chunks, embedder)

    # ── 5. Build and persist the index ──────────────────────────────────────
    await _report(session, repository, IndexStatus.INDEXING, "Building the vector index…")
    # Persisting the vectors makes the index rebuildable without re-embedding.
    chunk_rows = build_chunk_rows(
        repository.id, file_rows, chunks, vectors if store_content else None
    )

    store = FaissStore(
        directory=registry.index_directory(repository.id),
        dimension=embedder.dimension,
        model_name=embedder.model_name,
    )
    store.add(vectors, [row.id for row in chunk_rows])
    index_bytes = await asyncio.to_thread(store.save)
    registry.put_store(repository.id, store)

    session.add_all(chunk_rows)
    await session.flush()

    # ── 6. Finalise ─────────────────────────────────────────────────────────
    duration_ms = int((time.perf_counter() - started) * 1000)
    await write_index_record(session, repository, store, index_bytes, duration_ms)

    repository.file_count = len(file_rows)
    repository.chunk_count = len(chunk_rows)
    repository.total_bytes = sum(row.size_bytes for row in file_rows)
    repository.line_count = sum(row.line_count for row in file_rows)
    repository.indexed_at = utcnow()
    repository.error_message = None

    await _report(
        session,
        repository,
        IndexStatus.READY,
        f"Indexed {len(file_rows)} files into {len(chunk_rows)} chunks",
        detail=f"{duration_ms / 1000:.1f}s",
    )
    logger.info("Indexed %s in %.1fs", repository.full_name, duration_ms / 1000)


async def _embed_chunks(
    session: AsyncSession,
    repository: Repository,
    chunks: list[Chunk],
    embedder,
) -> "list":
    import numpy as np

    texts = [build_embedding_text(chunk) for chunk in chunks]
    batch_size = max(1, getattr(embedder, "batch_size", 32))
    batches = [texts[i : i + batch_size] for i in range(0, len(texts), batch_size)]

    collected = []
    for index, batch in enumerate(batches, start=1):
        collected.append(await embedder.embed_documents(batch))
        # Embedding dominates wall-clock time, so give it most of the bar.
        percent = 55 + int(35 * index / len(batches))
        await _report(
            session,
            repository,
            IndexStatus.EMBEDDING,
            f"Embedding chunks ({index * batch_size if index < len(batches) else len(texts)}/{len(texts)})",
            progress=min(percent, 90),
            detail=f"batch {index}/{len(batches)}",
        )

    return np.vstack(collected)
