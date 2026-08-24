"""Language-aware code chunking.

Splitting respects syntactic boundaries (LangChain's per-language separator
sets break on ``class``/``def``/``function`` before falling back to blank lines)
and every chunk carries the exact line range it came from, which is what makes
citations clickable.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from langchain_text_splitters import Language, RecursiveCharacterTextSplitter

from app.core.logging import get_logger
from app.core.shared_config import chunking, limits
from ingest.symbols import extract_symbols
from ingest.tokens import estimate_tokens

logger = get_logger(__name__)

# Our language ids -> LangChain's separator profiles.
_LANGCHAIN_LANGUAGES: dict[str, Language] = {
    "python": Language.PYTHON,
    "javascript": Language.JS,
    "jsx": Language.JS,
    "typescript": Language.TS,
    "tsx": Language.TS,
    "java": Language.JAVA,
    "cpp": Language.CPP,
    "c": Language.CPP,
    "go": Language.GO,
    "rust": Language.RUST,
    "ruby": Language.RUBY,
    "php": Language.PHP,
    "markdown": Language.MARKDOWN,
    "html": Language.HTML,
}


@dataclass(frozen=True)
class Chunk:
    content: str
    start_line: int
    end_line: int
    chunk_index: int
    language: str
    file_path: str
    token_count: int
    symbols: list[str]


@lru_cache(maxsize=32)
def _splitter_for(language: str) -> RecursiveCharacterTextSplitter:
    rules = chunking()
    kwargs = {
        "chunk_size": rules.target_chars,
        "chunk_overlap": rules.overlap_chars,
        "length_function": len,
        # Verbatim chunks are required so we can locate each one in the source
        # and derive true line numbers.
        "strip_whitespace": False,
    }

    langchain_language = _LANGCHAIN_LANGUAGES.get(language)
    if langchain_language is not None:
        try:
            return RecursiveCharacterTextSplitter.from_language(
                language=langchain_language, **kwargs
            )
        except (ValueError, KeyError):
            logger.debug("No LangChain profile for %s; using generic splitter", language)

    return RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", " ", ""], **kwargs
    )


def _normalise(text: str) -> str:
    """Collapse line endings and clip pathological minified lines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    max_len = limits().max_line_length
    if any(len(line) > max_len for line in text.split("\n")):
        text = "\n".join(
            line if len(line) <= max_len else line[:max_len] + " …"
            for line in text.split("\n")
        )
    return text


def chunk_file(content: str, file_path: str, language: str) -> list[Chunk]:
    """Split one file into retrievable chunks with accurate line ranges."""
    text = _normalise(content)
    if not text.strip():
        return []

    rules = chunking()
    pieces = [piece for piece in _splitter_for(language).split_text(text) if piece.strip()]
    if not pieces:
        return []

    chunks: list[Chunk] = []
    cursor = 0  # offset into `text`, advanced as pieces are located in order

    for piece in pieces:
        # Consecutive chunks overlap by design, so the next piece can begin
        # *before* the previous one ended — rewind the search window to match.
        search_from = max(0, cursor - rules.overlap_chars * 2)
        offset = text.find(piece, search_from)
        if offset == -1:
            # Splitter altered the text (rare); fall back to a global search so
            # we still emit a chunk rather than dropping code from the index.
            offset = max(text.find(piece), 0)
        cursor = offset + len(piece)

        # Line numbers must describe the stripped content we actually store,
        # not the raw piece which may open with blank lines.
        stripped = piece.strip()
        start_offset = offset + (len(piece) - len(piece.lstrip()))
        start_line = text.count("\n", 0, start_offset) + 1
        end_line = start_line + stripped.count("\n")
        if estimate_tokens(stripped) < rules.min_tokens and chunks:
            # Too small to retrieve on its own — fold it into the previous chunk.
            previous = chunks[-1]
            merged = f"{previous.content}\n{stripped}"
            if estimate_tokens(merged) <= rules.max_tokens:
                chunks[-1] = Chunk(
                    content=merged,
                    start_line=previous.start_line,
                    end_line=end_line,
                    chunk_index=previous.chunk_index,
                    language=language,
                    file_path=file_path,
                    token_count=estimate_tokens(merged),
                    symbols=extract_symbols(merged, language),
                )
                continue

        chunks.append(
            Chunk(
                content=stripped,
                start_line=start_line,
                end_line=max(start_line, end_line),
                chunk_index=len(chunks),
                language=language,
                file_path=file_path,
                token_count=estimate_tokens(stripped),
                symbols=extract_symbols(stripped, language),
            )
        )

    return chunks


def build_embedding_text(chunk: Chunk) -> str:
    """Prefix retrieval text with provenance.

    Embedding the path and symbol names alongside the body means a query like
    "where is JWT verified" can match on the identifier even when the body uses
    different vocabulary.
    """
    header = f"File: {chunk.file_path} (lines {chunk.start_line}-{chunk.end_line})"
    if chunk.symbols:
        header += f"\nSymbols: {', '.join(chunk.symbols)}"
    return f"{header}\n\n{chunk.content}"
