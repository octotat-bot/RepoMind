"""Chunking correctness.

The line-range assertions matter more than they look: citations are only
clickable because every chunk records the exact lines it came from, so a
regression here silently corrupts every answer's evidence.
"""

from __future__ import annotations

import pytest

from ingest.chunker import build_embedding_text, chunk_file
from ingest.symbols import extract_symbols

PYTHON_SOURCE = '''"""Module docstring."""

import os
from pathlib import Path


class TokenVerifier:
    """Verifies signed tokens."""

    def __init__(self, secret: str) -> None:
        self.secret = secret

    def verify(self, token: str) -> bool:
        if not token:
            return False
        return token.startswith(self.secret)


def build_verifier(secret: str) -> TokenVerifier:
    """Factory for the verifier."""
    return TokenVerifier(secret)


CONSTANT_VALUE = 42
'''

JS_SOURCE = """import React from 'react';
import { useState } from 'react';

export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = () => setValue((previous) => !previous);
  return [value, toggle];
}

export const Button = ({ children }) => {
  return <button className="btn">{children}</button>;
};

export default useToggle;
"""


def assert_line_ranges_are_exact(source: str, chunks) -> None:
    """Every chunk's reported range must match the real source lines."""
    lines = source.split("\n")
    for chunk in chunks:
        chunk_lines = chunk.content.split("\n")
        assert 1 <= chunk.start_line <= len(lines), f"start out of range: {chunk.start_line}"
        assert chunk.end_line <= len(lines), f"end out of range: {chunk.end_line}"
        assert chunk.start_line <= chunk.end_line

        assert lines[chunk.start_line - 1].strip() == chunk_lines[0].strip()
        assert lines[chunk.end_line - 1].strip() == chunk_lines[-1].strip()


@pytest.mark.parametrize(
    ("source", "language"),
    [(PYTHON_SOURCE, "python"), (JS_SOURCE, "javascript")],
)
def test_line_ranges_match_source(source: str, language: str) -> None:
    chunks = chunk_file(source, f"sample.{language}", language)
    assert chunks
    assert_line_ranges_are_exact(source, chunks)


def test_line_ranges_survive_leading_blank_lines() -> None:
    """A chunk starting after blank lines must not report the blank line."""
    source = "\n\n\n" + PYTHON_SOURCE
    chunks = chunk_file(source, "padded.py", "python")
    assert chunks
    assert_line_ranges_are_exact(source, chunks)
    assert chunks[0].content == chunks[0].content.strip()


def test_chunks_are_indexed_in_order() -> None:
    chunks = chunk_file(PYTHON_SOURCE * 6, "big.py", "python")
    assert [chunk.chunk_index for chunk in chunks] == list(range(len(chunks)))


def test_empty_and_whitespace_sources_produce_nothing() -> None:
    assert chunk_file("", "empty.py", "python") == []
    assert chunk_file("   \n\n  \t\n", "blank.py", "python") == []


def test_crlf_is_normalised() -> None:
    chunks = chunk_file(PYTHON_SOURCE.replace("\n", "\r\n"), "crlf.py", "python")
    assert chunks
    assert all("\r" not in chunk.content for chunk in chunks)


def test_very_long_lines_are_clipped() -> None:
    """Minified files must not blow up the context window."""
    source = "x = '" + ("a" * 12_000) + "'\nprint(x)\n"
    chunks = chunk_file(source, "minified.js", "javascript")
    assert chunks
    assert all(len(line) < 3000 for chunk in chunks for line in chunk.content.split("\n"))


def test_embedding_text_carries_provenance() -> None:
    chunks = chunk_file(PYTHON_SOURCE, "auth/verifier.py", "python")
    text = build_embedding_text(chunks[0])
    assert "auth/verifier.py" in text
    assert "lines" in text


def test_symbol_extraction() -> None:
    assert "TokenVerifier" in extract_symbols(PYTHON_SOURCE, "python")
    assert "build_verifier" in extract_symbols(PYTHON_SOURCE, "python")

    js_symbols = extract_symbols(JS_SOURCE, "javascript")
    assert "useToggle" in js_symbols
    assert "Button" in js_symbols


def test_unknown_language_still_chunks() -> None:
    chunks = chunk_file("some plain text\n" * 200, "notes.txt", "text")
    assert chunks
    assert all(chunk.token_count > 0 for chunk in chunks)
