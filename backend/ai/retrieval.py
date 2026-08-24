"""The retrieval half of RAG: query → vectors → chunks → ranked context."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.reranker import Candidate, rerank
from app.core.logging import get_logger
from app.core.shared_config import retrieval as retrieval_rules
from database.models.code import CodeChunk
from embeddings.factory import get_embedder
from ingest.tokens import estimate_tokens
from vectorstore import registry

logger = get_logger(__name__)


@dataclass
class RetrievedChunk:
    chunk_id: str
    file_path: str
    content: str
    language: str
    start_line: int
    end_line: int
    symbols: list[str]
    score: float
    vector_score: float
    rank: int

    def to_dict(self) -> dict:
        return {
            "chunkId": self.chunk_id,
            "filePath": self.file_path,
            "content": self.content,
            "language": self.language,
            "startLine": self.start_line,
            "endLine": self.end_line,
            "symbols": self.symbols,
            "score": round(self.score, 4),
            "vectorScore": round(self.vector_score, 4),
            "rank": self.rank,
        }


async def retrieve(
    session: AsyncSession,
    repository_id: str,
    query: str,
    top_k: int | None = None,
) -> list[RetrievedChunk]:
    """Find the chunks most relevant to ``query`` within one repository."""
    rules = retrieval_rules()
    limit = top_k or rules.top_k

    # Rebuilds the index from stored vectors when the disk has been wiped,
    # which is the normal case on a host that restarts between requests.
    from app.services.rehydrate import ensure_index

    store = await ensure_index(repository_id)
    if store is None or store.size == 0:
        logger.warning("No usable index for repository %s", repository_id)
        return []

    embedder = get_embedder()
    query_vector = await embedder.embed_query(query)

    # Over-fetch so the reranker has room to reorder and diversify.
    hits = store.search(query_vector, limit * rules.candidate_multiplier)
    hits = [hit for hit in hits if hit.score >= rules.min_similarity]
    if not hits:
        return []

    scores = {hit.chunk_id: hit.score for hit in hits}
    rows = (
        await session.execute(
            select(CodeChunk).where(CodeChunk.id.in_(list(scores.keys())))
        )
    ).scalars().all()

    candidates = [
        Candidate(
            chunk_id=row.id,
            file_path=row.file_path,
            content=row.content,
            language=row.language,
            start_line=row.start_line,
            end_line=row.end_line,
            symbols=(row.symbols or "").split(",") if row.symbols else [],
            vector_score=scores.get(row.id, 0.0),
        )
        for row in rows
    ]

    ranked = rerank(candidates, query, limit)
    return [
        RetrievedChunk(
            chunk_id=candidate.chunk_id,
            file_path=candidate.file_path,
            content=candidate.content,
            language=candidate.language,
            start_line=candidate.start_line,
            end_line=candidate.end_line,
            symbols=candidate.symbols,
            score=candidate.score,
            vector_score=candidate.vector_score,
            rank=index + 1,
        )
        for index, candidate in enumerate(ranked)
    ]


def build_context(chunks: list[RetrievedChunk]) -> str:
    """Render ranked chunks into numbered blocks, respecting the token budget."""
    from ai.prompts import CONTEXT_BLOCK

    budget = retrieval_rules().max_context_tokens
    blocks: list[str] = []
    used = 0

    for chunk in chunks:
        block = CONTEXT_BLOCK.format(
            number=chunk.rank,
            path=chunk.file_path,
            start=chunk.start_line,
            end=chunk.end_line,
            language=chunk.language,
            content=chunk.content,
        )
        cost = estimate_tokens(block)
        if used + cost > budget and blocks:
            logger.debug("Context budget reached after %d blocks", len(blocks))
            break
        blocks.append(block)
        used += cost

    return "\n\n".join(blocks)
