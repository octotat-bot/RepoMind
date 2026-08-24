"""Deterministic offline embedder.

This exists so the test suite and CI can exercise the full ingest → index →
retrieve path without a running Ollama. It is a hashed bag-of-tokens projection:
good enough to prove plumbing and rank exact keyword overlap, but semantically
far weaker than a real model. Never enable it in production.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence

import numpy as np

from app.core.config import settings
from embeddings.base import Embedder, normalize

_TOKEN_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")


class HashEmbedder(Embedder):
    def __init__(self, dimension: int | None = None) -> None:
        self.model_name = "hash-fallback"
        self.dimension = dimension or settings.embedding_dimension

    def _vector(self, text: str) -> np.ndarray:
        vector = np.zeros(self.dimension, dtype="float32")
        tokens = _TOKEN_PATTERN.findall(text.lower())
        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "little") % self.dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[bucket] += sign
        return vector

    async def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimension), dtype="float32")
        return normalize(np.vstack([self._vector(text) for text in texts]))

    async def embed_query(self, text: str) -> np.ndarray:
        return normalize(self._vector(text))[0]
