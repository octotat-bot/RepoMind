"""Embedder selection and process-wide reuse."""

from __future__ import annotations

from app.core.config import settings
from app.core.logging import get_logger
from embeddings.base import Embedder
from embeddings.hash_embedder import HashEmbedder
from embeddings.ollama_embedder import OllamaEmbedder

logger = get_logger(__name__)

_instance: Embedder | None = None


def build_embedder(provider: str | None = None) -> Embedder:
    selected = (provider or settings.embedding_provider).lower()

    if selected == "hash":
        logger.warning("Using the hash fallback embedder — retrieval quality will be poor")
        return HashEmbedder()

    if selected == "fastembed":
        # Imported lazily so the dependency is only required when selected.
        from embeddings.fastembed_embedder import FastEmbedEmbedder

        return FastEmbedEmbedder()

    if selected != "ollama":
        logger.warning("Unknown EMBEDDING_PROVIDER '%s'; falling back to ollama.", selected)
    return OllamaEmbedder()


def get_embedder() -> Embedder:
    """Return the shared embedder, keeping one HTTP connection pool alive."""
    global _instance
    if _instance is None:
        _instance = build_embedder()
    return _instance


async def close_embedder() -> None:
    global _instance
    if _instance is not None:
        await _instance.aclose()
        _instance = None
