"""Lightweight symbol extraction used to enrich chunk metadata.

These regexes are intentionally shallow — they label a chunk with the functions
and classes it contains so retrieval hits read as "auth.py · verifyToken" rather
than a bare line range. They are not a parser.
"""

from __future__ import annotations

import re

_JS_LIKE = {"javascript", "jsx", "typescript", "tsx"}

_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "python": (
        re.compile(r"^\s*(?:async\s+)?def\s+(\w+)", re.MULTILINE),
        re.compile(r"^\s*class\s+(\w+)", re.MULTILINE),
    ),
    "javascript": (
        re.compile(r"^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)", re.MULTILINE),
        re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>", re.MULTILINE),
        re.compile(r"^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)", re.MULTILINE),
        re.compile(r"^\s*(?:export\s+)?(?:type|interface)\s+(\w+)", re.MULTILINE),
    ),
    "java": (
        re.compile(r"^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)", re.MULTILINE),
        re.compile(r"^\s*(?:public|private|protected)\s+(?:static\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(", re.MULTILINE),
    ),
    "c": (
        re.compile(r"^\s*(?:[\w*]+\s+)+(\w+)\s*\([^;]*\)\s*\{", re.MULTILINE),
        re.compile(r"^\s*(?:struct|enum|union)\s+(\w+)", re.MULTILINE),
    ),
    "go": (
        re.compile(r"^\s*func\s+(?:\([^)]*\)\s*)?(\w+)", re.MULTILINE),
        re.compile(r"^\s*type\s+(\w+)", re.MULTILINE),
    ),
    "rust": (
        re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)", re.MULTILINE),
        re.compile(r"^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+(\w+)", re.MULTILINE),
    ),
    "markdown": (re.compile(r"^#{1,4}\s+(.+)$", re.MULTILINE),),
}

_PATTERNS["cpp"] = _PATTERNS["c"]
for _lang in _JS_LIKE:
    _PATTERNS[_lang] = _PATTERNS["javascript"]

_MAX_SYMBOLS = 8


def extract_symbols(text: str, language: str) -> list[str]:
    patterns = _PATTERNS.get(language)
    if not patterns:
        return []

    seen: list[str] = []
    for pattern in patterns:
        for match in pattern.finditer(text):
            symbol = match.group(1).strip()
            if symbol and symbol not in seen:
                seen.append(symbol)
                if len(seen) >= _MAX_SYMBOLS:
                    return seen
    return seen
