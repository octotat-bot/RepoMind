"""Token estimation.

A character-ratio estimate is deliberate: it is dependency-free, fast enough to
run over every chunk of a large repository, and only ever used for budgeting
(chunk sizing and context packing), never for billing.
"""

from __future__ import annotations

from app.core.shared_config import chunking


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // chunking().chars_per_token)


def fits_budget(text: str, budget_tokens: int) -> bool:
    return estimate_tokens(text) <= budget_tokens


def truncate_to_tokens(text: str, budget_tokens: int) -> str:
    limit = budget_tokens * chunking().chars_per_token
    if len(text) <= limit:
        return text
    return text[:limit].rsplit("\n", 1)[0] + "\n… (truncated)"
