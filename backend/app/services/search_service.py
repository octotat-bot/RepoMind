"""Semantic search over an indexed repository."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ai.retrieval import retrieve
from app.core.logging import get_logger

logger = get_logger(__name__)

_SNIPPET_LINES = 10


def _snippet(content: str) -> str:
    lines = content.split("\n")
    if len(lines) <= _SNIPPET_LINES:
        return content
    return "\n".join(lines[:_SNIPPET_LINES]) + "\n…"


async def search_repository(
    session: AsyncSession,
    repository_id: str,
    query: str,
    limit: int = 12,
    group_by_file: bool = True,
) -> dict:
    """Rank code by semantic similarity to ``query``.

    Chunk-level hits are optionally folded into file-level results so the UI can
    show "this file matched, here is the strongest passage" rather than several
    near-identical rows from the same file.
    """
    chunks = await retrieve(session, repository_id, query, top_k=limit)

    results = [
        {
            "chunkId": chunk.chunk_id,
            "filePath": chunk.file_path,
            "language": chunk.language,
            "startLine": chunk.start_line,
            "endLine": chunk.end_line,
            "snippet": _snippet(chunk.content),
            "symbols": chunk.symbols,
            "score": round(chunk.score, 4),
            "similarity": round(chunk.vector_score, 4),
            "rank": chunk.rank,
        }
        for chunk in chunks
    ]

    if group_by_file:
        results = _fold_by_file(results)

    return {"query": query, "count": len(results), "results": results}


def _fold_by_file(results: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}

    for result in results:
        path = result["filePath"]
        if path not in grouped:
            grouped[path] = {**result, "matches": 1, "otherMatches": []}
            continue

        entry = grouped[path]
        entry["matches"] += 1
        if len(entry["otherMatches"]) < 3:
            entry["otherMatches"].append({
                "startLine": result["startLine"],
                "endLine": result["endLine"],
                "score": result["score"],
                "chunkId": result["chunkId"],
            })

    folded = list(grouped.values())
    folded.sort(key=lambda item: item["score"], reverse=True)
    for rank, entry in enumerate(folded, start=1):
        entry["rank"] = rank
    return folded
