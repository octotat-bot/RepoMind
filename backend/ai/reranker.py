"""Context reranking.

Raw vector similarity is a weak sole ranking signal for code: identifier names
that match the query exactly are strong evidence that embeddings under-weight,
and the top-k by score alone is often six chunks from the same file. This module
blends lexical evidence into the score and then enforces per-file diversity.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace

from app.core.logging import get_logger

logger = get_logger(__name__)

_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")

# Query words this common carry no retrieval signal.
_STOPWORDS = frozenset({
    "the", "is", "at", "which", "on", "a", "an", "and", "or", "but", "in", "with",
    "to", "for", "of", "how", "what", "where", "when", "why", "does", "do", "did",
    "this", "that", "these", "those", "it", "its", "be", "are", "was", "were",
    "can", "could", "should", "would", "will", "explain", "find", "show", "me",
    "code", "file", "files", "function", "repo", "repository", "project",
})

_VECTOR_WEIGHT = 0.70
_LEXICAL_WEIGHT = 0.20
_SYMBOL_WEIGHT = 0.10
_PATH_BONUS = 0.05
_MAX_PER_FILE = 2


@dataclass
class Candidate:
    chunk_id: str
    file_path: str
    content: str
    language: str
    start_line: int
    end_line: int
    symbols: list[str]
    vector_score: float
    score: float = 0.0
    lexical_score: float = 0.0


def _tokenise(text: str) -> list[str]:
    return [word.lower() for word in _WORD.findall(text)]


def _split_identifier(identifier: str) -> set[str]:
    """Expand camelCase / snake_case so "verifyToken" matches "verify token".

    Must receive the identifier with its original casing — lowercasing first
    destroys the very boundary the split depends on.
    """
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", identifier)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)  # HTTPServer -> HTTP Server
    return {piece for piece in spaced.replace("_", " ").lower().split() if piece}


def query_terms(query: str) -> set[str]:
    terms: set[str] = set()
    # Case is preserved here so camelCase can still be split, then lowered.
    for token in _WORD.findall(query):
        lowered = token.lower()
        if lowered in _STOPWORDS or len(lowered) < 2:
            continue
        terms.add(lowered)
        terms |= _split_identifier(token)
    return terms


def _lexical_overlap(candidate: Candidate, terms: set[str]) -> float:
    """Fraction of query terms present in the chunk, damped by length."""
    if not terms:
        return 0.0
    body = set(_tokenise(candidate.content))
    matched = sum(1 for term in terms if term in body)
    if matched == 0:
        return 0.0
    coverage = matched / len(terms)
    # Long chunks match more terms by chance; damp them slightly.
    length_penalty = 1.0 / (1.0 + math.log1p(len(candidate.content) / 2000))
    return coverage * length_penalty


def _symbol_match(candidate: Candidate, terms: set[str]) -> float:
    if not terms or not candidate.symbols:
        return 0.0
    for symbol in candidate.symbols:
        pieces = _split_identifier(symbol)
        if symbol.lower() in terms or (pieces and pieces <= terms):
            return 1.0
        if pieces & terms:
            return 0.5
    return 0.0


def _path_match(candidate: Candidate, terms: set[str]) -> float:
    path_terms = set()
    for segment in candidate.file_path.replace("/", " ").replace(".", " ").split():
        path_terms |= _split_identifier(segment)
    return _PATH_BONUS if path_terms & terms else 0.0


def rerank(
    candidates: list[Candidate],
    query: str,
    top_k: int,
    max_per_file: int = _MAX_PER_FILE,
) -> list[Candidate]:
    """Score candidates on blended signals, then diversify across files."""
    if not candidates:
        return []

    terms = query_terms(query)

    scored: list[Candidate] = []
    for candidate in candidates:
        lexical = _lexical_overlap(candidate, terms)
        blended = (
            _VECTOR_WEIGHT * candidate.vector_score
            + _LEXICAL_WEIGHT * lexical
            + _SYMBOL_WEIGHT * _symbol_match(candidate, terms)
            + _path_match(candidate, terms)
        )
        scored.append(replace(candidate, score=blended, lexical_score=lexical))

    scored.sort(key=lambda item: item.score, reverse=True)

    # Diversity pass: a *soft* per-file cap. It guarantees a lower-scoring file
    # can still reach the context window, but backfills from the overflow rather
    # than returning fewer than top_k — when only one file is relevant, more
    # chunks from it beat padding the answer with nothing.
    selected: list[Candidate] = []
    overflow: list[Candidate] = []
    per_file: dict[str, int] = {}

    for candidate in scored:
        count = per_file.get(candidate.file_path, 0)
        if count < max_per_file and len(selected) < top_k:
            selected.append(candidate)
            per_file[candidate.file_path] = count + 1
        else:
            overflow.append(candidate)

    if len(selected) < top_k:
        selected.extend(overflow[: top_k - len(selected)])

    return selected[:top_k]
