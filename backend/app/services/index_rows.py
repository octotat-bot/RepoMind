"""Building and persisting the database rows an index is made of.

Split from ``indexing_service`` so that module is left describing the pipeline
itself. Everything here is pure row construction plus the writes that follow it.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.rehydrate import vector_to_bytes
from database.base import new_id
from database.models.code import CodeChunk, IndexRecord, RepositoryFile
from database.models.repository import Repository
from ingest.chunker import Chunk, chunk_file
from ingest.file_walker import DiscoveredFile, read_text
from vectorstore.faiss_store import FaissStore


def chunk_all(
    repository_id: str,
    workdir: Path,
    files: list[DiscoveredFile],
    store_content: bool = False,
) -> tuple[list[RepositoryFile], list[Chunk]]:
    """Read and chunk every discovered file.

    CPU-bound: the caller runs this via ``asyncio.to_thread`` to keep the event
    loop free for the progress stream.

    ``store_content`` keeps the file text on the row so the working tree can be
    rebuilt on a host whose disk does not survive a restart.
    """
    file_rows: list[RepositoryFile] = []
    all_chunks: list[Chunk] = []

    for discovered in files:
        content = read_text(discovered.absolute)
        if content is None:
            continue

        chunks = chunk_file(content, discovered.path, discovered.language)
        if not chunks:
            continue

        file_rows.append(
            RepositoryFile(
                id=new_id(),
                repository_id=repository_id,
                path=discovered.path,
                name=discovered.name,
                extension=discovered.extension,
                language=discovered.language,
                size_bytes=discovered.size_bytes,
                line_count=content.count("\n") + 1,
                chunk_count=len(chunks),
                content=content if store_content else None,
            )
        )
        all_chunks.extend(chunks)

    return file_rows, all_chunks


async def persist_files(
    session: AsyncSession, repository: Repository, file_rows: list[RepositoryFile]
) -> None:
    """Replace the repository's file rows. Re-indexing must not accumulate."""
    await session.execute(
        delete(RepositoryFile).where(RepositoryFile.repository_id == repository.id)
    )
    session.add_all(file_rows)
    await session.flush()


def build_chunk_rows(
    repository_id: str,
    file_rows: list[RepositoryFile],
    chunks: list[Chunk],
    vectors: "np.ndarray | None" = None,
) -> list[CodeChunk]:
    """Turn chunks into rows.

    ``vector_id`` is the chunk's position in the FAISS index, which is what lets
    a similarity hit be resolved back to a file path and line range.

    When ``vectors`` is supplied each row also carries its embedding, making the
    FAISS index a derived artefact that can be rebuilt without re-embedding.
    """
    file_id_by_path = {row.path: row.id for row in file_rows}
    rows: list[CodeChunk] = []

    for vector_id, chunk in enumerate(chunks):
        file_id = file_id_by_path.get(chunk.file_path)
        if file_id is None:
            continue
        rows.append(
            CodeChunk(
                id=new_id(),
                repository_id=repository_id,
                file_id=file_id,
                vector_id=vector_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                file_path=chunk.file_path,
                language=chunk.language,
                start_line=chunk.start_line,
                end_line=chunk.end_line,
                token_count=chunk.token_count,
                symbols=",".join(chunk.symbols) if chunk.symbols else None,
                embedding=(
                    vector_to_bytes(vectors[vector_id])
                    if vectors is not None and vector_id < len(vectors)
                    else None
                ),
            )
        )
    return rows


async def write_index_record(
    session: AsyncSession,
    repository: Repository,
    store: FaissStore,
    size_bytes: int,
    duration_ms: int,
) -> None:
    """Upsert the bookkeeping row describing the on-disk FAISS index."""
    existing = (
        await session.execute(
            select(IndexRecord).where(IndexRecord.repository_id == repository.id)
        )
    ).scalar_one_or_none()

    if existing is None:
        existing = IndexRecord(id=new_id(), repository_id=repository.id)
        session.add(existing)

    existing.provider = "faiss"
    existing.embedding_model = store.model_name
    existing.dimension = store.dimension
    existing.metric = "cosine"
    existing.vector_count = store.size
    existing.index_path = str(store.directory)
    existing.size_bytes = size_bytes
    existing.build_duration_ms = duration_ms
    await session.flush()
