"""Typed accessors over ``shared/constants.json``.

The same JSON document drives the frontend, guaranteeing that the language
badges the UI renders match the languages the ingestion pipeline recognises.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.core.config import PROJECT_ROOT

CONSTANTS_PATH = PROJECT_ROOT / "shared" / "constants.json"


@dataclass(frozen=True)
class ChunkingRules:
    target_tokens: int
    min_tokens: int
    max_tokens: int
    overlap_tokens: int
    chars_per_token: int

    @property
    def target_chars(self) -> int:
        return self.target_tokens * self.chars_per_token

    @property
    def overlap_chars(self) -> int:
        return self.overlap_tokens * self.chars_per_token


@dataclass(frozen=True)
class RetrievalRules:
    top_k: int
    candidate_multiplier: int
    min_similarity: float
    max_context_tokens: int


@dataclass(frozen=True)
class IngestionLimits:
    max_file_bytes: int
    max_files_per_repo: int
    max_repo_bytes: int
    max_line_length: int


@lru_cache(maxsize=1)
def _raw() -> dict[str, Any]:
    with CONSTANTS_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=1)
def chunking() -> ChunkingRules:
    data = _raw()["chunking"]
    return ChunkingRules(
        target_tokens=data["targetTokens"],
        min_tokens=data["minTokens"],
        max_tokens=data["maxTokens"],
        overlap_tokens=data["overlapTokens"],
        chars_per_token=data["charsPerToken"],
    )


@lru_cache(maxsize=1)
def retrieval() -> RetrievalRules:
    data = _raw()["retrieval"]
    return RetrievalRules(
        top_k=data["topK"],
        candidate_multiplier=data["candidateMultiplier"],
        min_similarity=data["minSimilarity"],
        max_context_tokens=data["maxContextTokens"],
    )


@lru_cache(maxsize=1)
def limits() -> IngestionLimits:
    data = _raw()["limits"]
    return IngestionLimits(
        max_file_bytes=data["maxFileBytes"],
        max_files_per_repo=data["maxFilesPerRepo"],
        max_repo_bytes=data["maxRepoBytes"],
        max_line_length=data["maxLineLength"],
    )


@lru_cache(maxsize=1)
def language_by_extension() -> dict[str, str]:
    return dict(_raw()["languages"])


@lru_cache(maxsize=1)
def ignored_directories() -> frozenset[str]:
    return frozenset(_raw()["ignoredDirectories"])


@lru_cache(maxsize=1)
def ignored_file_globs() -> tuple[str, ...]:
    return tuple(_raw()["ignoredFileGlobs"])


@lru_cache(maxsize=1)
def binary_extensions() -> frozenset[str]:
    return frozenset(_raw()["binaryExtensions"])


@lru_cache(maxsize=1)
def primary_languages() -> frozenset[str]:
    return frozenset(_raw()["primaryLanguages"])


@lru_cache(maxsize=1)
def tech_stack_signals() -> dict[str, str]:
    return dict(_raw()["techStackSignals"])
