"""Turn a streamed answer plus its retrieval evidence into a structured result.

Citations and confidence are derived, not self-reported. A 3B model asked to
rate its own certainty produces noise; the retrieval distribution and which
blocks the model actually cited are measurable and honest.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ai.retrieval import RetrievedChunk

# Matches [1], [2][3] and [1, 2] — the citation forms small models emit.
_CITATION_PATTERN = re.compile(r"\[(\d+(?:\s*,\s*\d+)*)\]")

_MAX_RELATED_FILES = 6


@dataclass
class Citation:
    chunk_id: str
    file_path: str
    start_line: int
    end_line: int
    language: str
    snippet: str
    score: float
    number: int

    def to_dict(self) -> dict:
        return {
            "chunkId": self.chunk_id,
            "filePath": self.file_path,
            "startLine": self.start_line,
            "endLine": self.end_line,
            "language": self.language,
            "snippet": self.snippet,
            "score": round(self.score, 4),
            "number": self.number,
        }


@dataclass
class AnswerAnalysis:
    citations: list[Citation] = field(default_factory=list)
    related_files: list[str] = field(default_factory=list)
    confidence: float = 0.0
    reasoning: str = ""

    def to_dict(self) -> dict:
        return {
            "citations": [citation.to_dict() for citation in self.citations],
            "relatedFiles": self.related_files,
            "confidence": round(self.confidence, 3),
            "reasoning": self.reasoning,
        }


def extract_cited_numbers(answer: str) -> set[int]:
    numbers: set[int] = set()
    for match in _CITATION_PATTERN.finditer(answer):
        for part in match.group(1).split(","):
            part = part.strip()
            if part.isdigit():
                numbers.add(int(part))
    return numbers


def _snippet(chunk: RetrievedChunk, max_lines: int = 12) -> str:
    lines = chunk.content.split("\n")
    if len(lines) <= max_lines:
        return chunk.content
    return "\n".join(lines[:max_lines]) + "\n…"


def _compute_confidence(
    chunks: list[RetrievedChunk],
    cited: list[Citation],
    answer: str,
) -> float:
    """Blend retrieval strength, citation behaviour and answer hedging."""
    if not chunks:
        return 0.0

    top_scores = [chunk.vector_score for chunk in chunks[:3]]
    retrieval_strength = sum(top_scores) / len(top_scores)

    # Agreement between the top hits: a clear winner is more trustworthy than a
    # flat distribution where everything scored about the same.
    spread = max(top_scores) - min(top_scores) if len(top_scores) > 1 else 0.0
    agreement = 1.0 - min(spread, 0.5) / 0.5

    citation_coverage = min(len(cited) / 3.0, 1.0)

    confidence = 0.55 * retrieval_strength + 0.15 * agreement + 0.30 * citation_coverage

    # An answer that admits it lacks evidence should not read as confident.
    lowered = answer.lower()
    if any(
        phrase in lowered
        for phrase in ("not found in", "does not contain", "cannot find", "no relevant",
                       "context does not", "i don't have", "unable to find")
    ):
        confidence *= 0.45
    if not cited:
        confidence *= 0.7

    return max(0.0, min(confidence, 0.99))


def _build_reasoning(chunks: list[RetrievedChunk], cited: list[Citation]) -> str:
    if not chunks:
        return "No indexed chunks passed the similarity threshold for this question."

    files = {chunk.file_path for chunk in chunks}
    best = chunks[0]
    parts = [
        f"Searched the vector index and retrieved {len(chunks)} chunk"
        f"{'s' if len(chunks) != 1 else ''} across {len(files)} file"
        f"{'s' if len(files) != 1 else ''}.",
        f"Strongest match was {best.file_path}:{best.start_line}-{best.end_line} "
        f"(similarity {best.vector_score:.2f}).",
    ]
    if cited:
        names = ", ".join(dict.fromkeys(citation.file_path for citation in cited))
        parts.append(f"The answer draws on {names}.")
    else:
        parts.append("The model did not cite specific blocks, so treat this answer with care.")
    return " ".join(parts)


def analyse(answer: str, chunks: list[RetrievedChunk]) -> AnswerAnalysis:
    """Attach citations, related files, confidence and a retrieval trace."""
    by_number = {chunk.rank: chunk for chunk in chunks}
    cited_numbers = sorted(number for number in extract_cited_numbers(answer) if number in by_number)

    citations = [
        Citation(
            chunk_id=(chunk := by_number[number]).chunk_id,
            file_path=chunk.file_path,
            start_line=chunk.start_line,
            end_line=chunk.end_line,
            language=chunk.language,
            snippet=_snippet(chunk),
            score=chunk.score,
            number=number,
        )
        for number in cited_numbers
    ]

    cited_paths = {citation.file_path for citation in citations}
    related = [
        chunk.file_path
        for chunk in chunks
        if chunk.file_path not in cited_paths
    ]
    # Preserve rank order while de-duplicating.
    related_files = list(dict.fromkeys(related))[:_MAX_RELATED_FILES]

    return AnswerAnalysis(
        citations=citations,
        related_files=related_files,
        confidence=_compute_confidence(chunks, citations, answer),
        reasoning=_build_reasoning(chunks, citations),
    )
