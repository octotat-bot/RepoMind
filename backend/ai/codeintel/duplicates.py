"""Duplicate utility detection via normalised function fingerprints.

Functions are reduced to a structural fingerprint — comments, whitespace,
string contents and local identifier names removed — so two copies of the same
helper match even when the variables were renamed.
"""

from __future__ import annotations

import hashlib
import re
from collections import defaultdict

from ai.codeintel.analyzer import RepositoryGraph
from database.enums import FindingKind, Severity
from ingest.file_walker import read_text

_MIN_BODY_LINES = 4
_MAX_FINDINGS = 25

_PY_FUNCTION = re.compile(r"^([ \t]*)(?:async\s+)?def\s+(\w+)\s*\(", re.MULTILINE)
_JS_FUNCTION = re.compile(
    r"^([ \t]*)(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:function\s*\*?\s*(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)",
    re.MULTILINE,
)

_COMMENT = re.compile(r"(#[^\n]*)|(//[^\n]*)|(/\*.*?\*/)", re.DOTALL)
_STRING = re.compile(r"(\"\"\".*?\"\"\")|('''.*?''')|(\"[^\"\n]*\")|('[^'\n]*')", re.DOTALL)
_WHITESPACE = re.compile(r"\s+")


def _fingerprint(body: str) -> str:
    normalised = _COMMENT.sub("", body)
    normalised = _STRING.sub('""', normalised)
    normalised = _WHITESPACE.sub(" ", normalised).strip()
    return hashlib.blake2b(normalised.encode("utf-8"), digest_size=16).hexdigest()


def _extract_functions(source: str, language: str) -> list[tuple[str, int, str]]:
    """Return ``(name, line, body)`` for each top-level-ish function."""
    pattern = _PY_FUNCTION if language == "python" else _JS_FUNCTION
    lines = source.split("\n")
    matches = list(pattern.finditer(source))
    functions: list[tuple[str, int, str]] = []

    for index, match in enumerate(matches):
        name = next((group for group in match.groups()[1:] if group), None)
        if not name:
            continue
        start_line = source.count("\n", 0, match.start())
        end_line = (
            source.count("\n", 0, matches[index + 1].start())
            if index + 1 < len(matches)
            else len(lines)
        )
        body = "\n".join(lines[start_line:end_line])
        if body.count("\n") >= _MIN_BODY_LINES:
            functions.append((name, start_line + 1, body))

    return functions


def find_duplicates(graph: RepositoryGraph, root) -> list[dict]:
    buckets: dict[str, list[dict]] = defaultdict(list)

    for path, module in graph.modules.items():
        source = read_text(root / path)
        if source is None:
            continue
        for name, line, body in _extract_functions(source, module.language):
            buckets[_fingerprint(body)].append({
                "filePath": path,
                "symbol": name,
                "line": line,
                "lines": body.count("\n") + 1,
            })

    findings: list[dict] = []
    for occurrences in buckets.values():
        # Same fingerprint in a single file is usually an overload, not a dupe.
        distinct_files = {item["filePath"] for item in occurrences}
        if len(occurrences) < 2 or len(distinct_files) < 2:
            continue

        primary = occurrences[0]
        others = occurrences[1:]
        locations = ", ".join(
            f"{item['filePath']}:{item['line']}" for item in others[:3]
        )
        findings.append({
            "kind": FindingKind.DUPLICATE_UTILITY.value,
            "severity": (
                Severity.HIGH if primary["lines"] > 25 else Severity.MEDIUM
            ).value,
            "filePath": primary["filePath"],
            "symbol": primary["symbol"],
            "symbolKind": "function",
            "line": primary["line"],
            "message": (
                f"`{primary['symbol']}` ({primary['lines']} lines) appears to be duplicated "
                f"in {locations}."
            ),
            "duplicates": others[:5],
        })

    findings.sort(key=lambda item: item["severity"] != Severity.HIGH.value)
    return findings[:_MAX_FINDINGS]
