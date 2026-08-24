"""Per-repository FAISS index with on-disk persistence.

Vectors are L2-normalised and stored in an ``IndexFlatIP``, which makes the
inner product exactly cosine similarity. Flat (exhaustive) search is the right
call at this scale: a large repository yields tens of thousands of chunks, where
flat search is sub-millisecond and — unlike IVF/HNSW — needs no training step
and returns exact neighbours.
"""

from __future__ import annotations

import json
import shutil
import threading
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import faiss
import numpy as np

from app.core.errors import IndexingError
from app.core.logging import get_logger

logger = get_logger(__name__)

INDEX_FILENAME = "index.faiss"
META_FILENAME = "meta.json"


@dataclass(frozen=True)
class SearchHit:
    chunk_id: str
    vector_id: int
    score: float


class FaissStore:
    """A vector index plus the chunk ids each row maps back to.

    Row order is the contract: ``chunk_ids[i]`` identifies the chunk whose
    embedding sits at row ``i``, and that row number is persisted on the chunk
    as ``vector_id``.
    """

    def __init__(self, directory: Path, dimension: int, model_name: str) -> None:
        self.directory = directory
        self.dimension = dimension
        self.model_name = model_name
        self.chunk_ids: list[str] = []
        self._index = faiss.IndexFlatIP(dimension)
        # faiss objects are not thread-safe for concurrent add/search.
        self._lock = threading.Lock()

    # ── Construction ────────────────────────────────────────────────────────

    def add(self, vectors: np.ndarray, chunk_ids: list[str]) -> None:
        if len(vectors) != len(chunk_ids):
            raise IndexingError(
                f"Vector/id length mismatch: {len(vectors)} vs {len(chunk_ids)}"
            )
        if len(vectors) == 0:
            return

        vectors = np.ascontiguousarray(vectors, dtype="float32")
        if vectors.shape[1] != self.dimension:
            raise IndexingError(
                f"Expected {self.dimension}-dim vectors, received {vectors.shape[1]}"
            )

        with self._lock:
            self._index.add(vectors)
            self.chunk_ids.extend(chunk_ids)

    # ── Query ───────────────────────────────────────────────────────────────

    def search(self, query: np.ndarray, k: int) -> list[SearchHit]:
        if self.size == 0:
            return []

        vector = np.ascontiguousarray(
            np.asarray(query, dtype="float32").reshape(1, -1)
        )
        with self._lock:
            scores, indices = self._index.search(vector, min(k, self.size))

        hits: list[SearchHit] = []
        for score, row in zip(scores[0], indices[0], strict=True):
            # faiss returns -1 when it has fewer neighbours than requested.
            if row < 0 or row >= len(self.chunk_ids):
                continue
            hits.append(
                SearchHit(chunk_id=self.chunk_ids[row], vector_id=int(row), score=float(score))
            )
        return hits

    @property
    def size(self) -> int:
        return int(self._index.ntotal)

    # ── Persistence ─────────────────────────────────────────────────────────

    def save(self) -> int:
        self.directory.mkdir(parents=True, exist_ok=True)
        index_path = self.directory / INDEX_FILENAME

        with self._lock:
            faiss.write_index(self._index, str(index_path))
            metadata = {
                "dimension": self.dimension,
                "model": self.model_name,
                "metric": "cosine",
                "vector_count": self.size,
                "chunk_ids": self.chunk_ids,
                "saved_at": datetime.now(UTC).isoformat(),
            }

        (self.directory / META_FILENAME).write_text(
            json.dumps(metadata), encoding="utf-8"
        )
        size_bytes = index_path.stat().st_size + (self.directory / META_FILENAME).stat().st_size
        logger.info("Saved %d vectors to %s", self.size, self.directory)
        return size_bytes

    @classmethod
    def load(cls, directory: Path) -> "FaissStore | None":
        index_path = directory / INDEX_FILENAME
        meta_path = directory / META_FILENAME
        if not index_path.exists() or not meta_path.exists():
            return None

        try:
            metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            store = cls(
                directory=directory,
                dimension=metadata["dimension"],
                model_name=metadata.get("model", "unknown"),
            )
            store._index = faiss.read_index(str(index_path))
            store.chunk_ids = metadata.get("chunk_ids", [])
        except (json.JSONDecodeError, KeyError, OSError, RuntimeError) as exc:
            logger.error("Corrupt index at %s (%s); it will be rebuilt", directory, exc)
            return None

        if store.size != len(store.chunk_ids):
            logger.error(
                "Index at %s is inconsistent (%d vectors vs %d ids); it will be rebuilt",
                directory, store.size, len(store.chunk_ids),
            )
            return None

        return store

    @staticmethod
    def destroy(directory: Path) -> None:
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
            logger.info("Deleted index directory %s", directory)
