"""In-process embeddings via ONNX, for hosts without a GPU or an Ollama daemon.

fastembed runs quantised ONNX models on CPU with no PyTorch, which is what makes
it viable on a free 512 MB instance. The default model is nomic-embed-text-v1.5
so the vector dimension matches the Ollama default and indexes stay comparable.

Inference is synchronous and CPU-bound, so every call is pushed to a worker
thread; running it inline would block the event loop and stall the SSE progress
stream during indexing.
"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from typing import Any

import numpy as np

from app.core.config import settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from embeddings.base import Embedder, normalize

logger = get_logger(__name__)

# The same asymmetric task prefixes nomic was trained with.
_DOCUMENT_PREFIX = "search_document: "
_QUERY_PREFIX = "search_query: "

# Models whose prefixes differ from nomic's; bge uses an instruction on queries
# only, and using the wrong prefix measurably hurts recall.
_BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class FastEmbedEmbedder(Embedder):
    def __init__(self, model: str | None = None, batch_size: int | None = None) -> None:
        self.model_name = model or settings.fastembed_model
        self.batch_size = batch_size or settings.embedding_batch_size
        self.dimension = settings.embedding_dimension
        self._model: Any | None = None
        self._lock = asyncio.Lock()

    def _prefixes(self) -> tuple[str, str]:
        lowered = self.model_name.lower()
        if "nomic" in lowered:
            return _DOCUMENT_PREFIX, _QUERY_PREFIX
        if "bge" in lowered:
            return "", _BGE_QUERY_PREFIX
        return "", ""

    async def _ensure_model(self) -> Any:
        """Load the model once, on first use.

        Loading downloads ~130 MB the first time and takes a few seconds, so it
        is deliberately lazy: the API can boot and serve auth and listings while
        the model is still cold.
        """
        if self._model is not None:
            return self._model

        async with self._lock:
            if self._model is not None:
                return self._model
            try:
                from fastembed import TextEmbedding
            except ImportError as exc:  # pragma: no cover - dependency guard
                raise UpstreamError(
                    "EMBEDDING_PROVIDER=fastembed requires the 'fastembed' package. "
                    "Install it with: pip install fastembed"
                ) from exc

            logger.info("Loading embedding model %s (first run downloads it)", self.model_name)
            try:
                self._model = await asyncio.to_thread(
                    TextEmbedding,
                    model_name=self.model_name,
                    cache_dir=str(settings.model_cache_dir),
                    # ONNX allocates working buffers per thread. On a 512 MB
                    # instance the default thread count pushes peak memory
                    # ~110 MB higher and the process is killed mid-index, so
                    # small hosts are pinned to one thread. Measured on
                    # bge-small over 446 chunks: 458 MB → 348 MB.
                    threads=settings.embedding_threads or None,
                )
            except Exception as exc:  # noqa: BLE001 - surfaced to the caller
                raise UpstreamError(
                    f"Could not load embedding model '{self.model_name}': {exc}"
                ) from exc
            logger.info("Embedding model ready")

        return self._model

    def _encode(self, model: Any, texts: list[str]) -> np.ndarray:
        return np.asarray(list(model.embed(texts, batch_size=self.batch_size)), dtype="float32")

    async def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimension), dtype="float32")

        model = await self._ensure_model()
        document_prefix, _ = self._prefixes()
        prepared = [document_prefix + text for text in texts]

        array = await asyncio.to_thread(self._encode, model, prepared)
        self._remember_dimension(array.shape[1])
        return normalize(array)

    async def embed_query(self, text: str) -> np.ndarray:
        model = await self._ensure_model()
        _, query_prefix = self._prefixes()

        array = await asyncio.to_thread(self._encode, model, [query_prefix + text])
        self._remember_dimension(array.shape[1])
        return normalize(array)[0]

    def _remember_dimension(self, dimension: int) -> None:
        """Trust the model over configuration if they disagree."""
        if dimension and dimension != self.dimension:
            logger.info("Embedding dimension is %d (configured %d)", dimension, self.dimension)
            self.dimension = dimension

    async def warmup(self) -> None:
        """Load and exercise the model so the first real request is not slow."""
        await self.embed_query("warmup")
