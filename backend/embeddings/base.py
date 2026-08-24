"""Embedding provider interface.

Documents and queries are embedded through separate methods because
``nomic-embed-text`` is an asymmetric model: it expects a task prefix, and using
the right one materially improves retrieval quality.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

import numpy as np


class Embedder(ABC):
    model_name: str
    dimension: int

    @abstractmethod
    async def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        """Embed corpus chunks. Returns an (n, dim) float32 array."""

    @abstractmethod
    async def embed_query(self, text: str) -> np.ndarray:
        """Embed a single search query. Returns a (dim,) float32 array."""

    async def aclose(self) -> None:
        return None


def normalize(vectors: np.ndarray) -> np.ndarray:
    """L2-normalise rows so an inner-product index yields cosine similarity."""
    vectors = np.asarray(vectors, dtype="float32")
    if vectors.ndim == 1:
        vectors = vectors.reshape(1, -1)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return (vectors / norms).astype("float32")
