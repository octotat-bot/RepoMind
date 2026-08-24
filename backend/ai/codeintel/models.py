"""Shared value objects for static analysis."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ExportedSymbol:
    name: str
    kind: str  # function | class | variable | component | type | default
    line: int
    is_default: bool = False


@dataclass
class ImportEdge:
    specifier: str  # exactly as written in the source
    names: list[str] = field(default_factory=list)
    line: int = 0
    is_relative: bool = False


@dataclass
class ModuleInfo:
    """What one source file imports, exports and mentions.

    ``referenced_names`` is every identifier appearing in the file *other than*
    its own export statements, which is how an export is judged used or dead.
    """

    path: str
    language: str
    imports: list[ImportEdge] = field(default_factory=list)
    exports: list[ExportedSymbol] = field(default_factory=list)
    referenced_names: set[str] = field(default_factory=set)
    line_count: int = 0
    parse_failed: bool = False
