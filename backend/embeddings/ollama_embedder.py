"""Embeddings served by a local Ollama instance (default: nomic-embed-text)."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence

import httpx
import numpy as np

from app.core.config import settings
from app.core.errors import UpstreamError
from app.core.logging import get_logger
from embeddings.base import Embedder, normalize

logger = get_logger(__name__)

# nomic-embed-text is asymmetric and trained with these task prefixes.
_DOCUMENT_PREFIX = "search_document: "
_QUERY_PREFIX = "search_query: "

_MAX_ATTEMPTS = 3


class OllamaEmbedder(Embedder):
    def __init__(
        self,
        model: str | None = None,
        base_url: str | None = None,
        batch_size: int | None = None,
    ) -> None:
        self.model_name = model or settings.ollama_embed_model
        self.dimension = settings.embedding_dimension
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.batch_size = batch_size or settings.embedding_batch_size
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(settings.ollama_timeout_seconds, connect=10.0),
        )

    async def _embed(self, inputs: list[str]) -> list[list[float]]:
        payload = {"model": self.model_name, "input": inputs}
        last_error: Exception | None = None

        for attempt in range(1, _MAX_ATTEMPTS + 1):
            try:
                response = await self._client.post("/api/embed", json=payload)
                if response.status_code == 404:
                    raise UpstreamError(
                        f"Ollama does not have '{self.model_name}'. "
                        f"Run: ollama pull {self.model_name}"
                    )
                response.raise_for_status()
                embeddings = response.json().get("embeddings")
                if not embeddings:
                    raise UpstreamError("Ollama returned an empty embedding response.")
                return embeddings
            except UpstreamError:
                raise
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt < _MAX_ATTEMPTS:
                    backoff = 2 ** (attempt - 1)
                    logger.warning(
                        "Embedding attempt %d/%d failed (%s); retrying in %ss",
                        attempt, _MAX_ATTEMPTS, exc, backoff,
                    )
                    await asyncio.sleep(backoff)

        raise UpstreamError(
            f"Could not reach Ollama at {self.base_url}. Is `ollama serve` running? "
            f"({last_error})"
        )

    async def embed_documents(self, texts: Sequence[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dimension), dtype="float32")

        vectors: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            batch = [_DOCUMENT_PREFIX + text for text in texts[start : start + self.batch_size]]
            vectors.extend(await self._embed(batch))

        array = np.asarray(vectors, dtype="float32")
        self._remember_dimension(array.shape[1])
        return normalize(array)

    async def embed_query(self, text: str) -> np.ndarray:
        vectors = await self._embed([_QUERY_PREFIX + text])
        array = np.asarray(vectors, dtype="float32")
        self._remember_dimension(array.shape[1])
        return normalize(array)[0]

    def _remember_dimension(self, dimension: int) -> None:
        """Trust the model over configuration if they disagree."""
        if dimension and dimension != self.dimension:
            logger.info("Embedding dimension is %d (configured %d)", dimension, self.dimension)
            self.dimension = dimension

    async def aclose(self) -> None:
        await self._client.aclose()
