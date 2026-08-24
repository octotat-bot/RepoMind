"""JavaScript / TypeScript module analysis.

Python gets a real AST; JS/TS is handled with carefully scoped regexes because
shipping a JS parser into a Python service (tree-sitter, dukpy) is a heavy
dependency for a linting feature. The trade-off is documented in
``docs/dead-code.md``: findings here are advisory and deliberately conservative,
skipping constructs the regexes cannot see through (re-exports, dynamic access).
"""

from __future__ import annotations

import re

from ai.codeintel.models import ExportedSymbol, ImportEdge, ModuleInfo

# import x, {a as b} from 'mod' / import 'mod' / export ... from 'mod'
_IMPORT = re.compile(
    r"""(?:^|\n)\s*(?:import|export)\s+(?P<clause>[^'"();]*?)?\s*from\s*['"](?P<spec>[^'"]+)['"]""",
    re.MULTILINE,
)
_BARE_IMPORT = re.compile(r"""(?:^|\n)\s*import\s*['"](?P<spec>[^'"]+)['"]""", re.MULTILINE)
_REQUIRE = re.compile(r"""require\s*\(\s*['"](?P<spec>[^'"]+)['"]\s*\)""")
_DYNAMIC_IMPORT = re.compile(r"""import\s*\(\s*['"](?P<spec>[^'"]+)['"]\s*\)""")

_EXPORT_NAMED = re.compile(
    r"^\s*export\s+(?:async\s+)?(?P<kind>function\s*\*?|class|const|let|var|type|interface|enum)\s+(?P<name>\w+)",
    re.MULTILINE,
)
_EXPORT_LIST = re.compile(r"^\s*export\s*\{(?P<body>[^}]*)\}", re.MULTILINE)
_EXPORT_DEFAULT = re.compile(
    r"^\s*export\s+default\s+(?:(?:async\s+)?function\s*\*?\s*(?P<fn>\w+)|class\s+(?P<cls>\w+)|(?P<name>\w+)\s*;?\s*$)",
    re.MULTILINE,
)
_IDENTIFIER = re.compile(r"[A-Za-z_$][\w$]*")

_KIND_MAP = {
    "function": "function",
    "function*": "function",
    "class": "class",
    "const": "variable",
    "let": "variable",
    "var": "variable",
    "type": "type",
    "interface": "type",
    "enum": "type",
}

# Stripping these first keeps commented-out code and string literals from
# registering as real imports or references.
_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_LINE_COMMENT = re.compile(r"(?<!:)//[^\n]*")


def _strip_noise(source: str) -> str:
    return _LINE_COMMENT.sub("", _BLOCK_COMMENT.sub("", source))


def _line_of(source: str, position: int) -> int:
    return source.count("\n", 0, position) + 1


def _parse_clause(clause: str) -> list[str]:
    """Pull bound names out of an import clause."""
    names: list[str] = []
    clause = (clause or "").strip()
    if not clause:
        return names

    if braces := re.search(r"\{([^}]*)\}", clause):
        for entry in braces.group(1).split(","):
            entry = entry.strip()
            if not entry:
                continue
            # "a as b" binds b
            names.append(entry.split(" as ")[-1].strip())
        clause = clause[: braces.start()] + clause[braces.end() :]

    for part in clause.split(","):
        part = part.strip().removeprefix("*").strip()
        if part.startswith("as "):
            part = part[3:].strip()
        if part and part.isidentifier():
            names.append(part)

    return [name for name in names if name]


def analyse_javascript(path: str, source: str, language: str = "javascript") -> ModuleInfo:
    cleaned = _strip_noise(source)
    info = ModuleInfo(path=path, language=language, line_count=source.count("\n") + 1)

    # ── Imports ─────────────────────────────────────────────────────────────
    seen: set[tuple[str, int]] = set()
    for match in _IMPORT.finditer(cleaned):
        specifier = match.group("spec")
        line = _line_of(cleaned, match.start())
        if (specifier, line) in seen:
            continue
        seen.add((specifier, line))
        info.imports.append(
            ImportEdge(
                specifier=specifier,
                names=_parse_clause(match.group("clause")),
                line=line,
                is_relative=specifier.startswith((".", "@/", "~/", "src/")),
            )
        )

    for pattern in (_BARE_IMPORT, _REQUIRE, _DYNAMIC_IMPORT):
        for match in pattern.finditer(cleaned):
            specifier = match.group("spec")
            line = _line_of(cleaned, match.start())
            if (specifier, line) in seen:
                continue
            seen.add((specifier, line))
            info.imports.append(
                ImportEdge(
                    specifier=specifier,
                    line=line,
                    is_relative=specifier.startswith((".", "@/", "~/", "src/")),
                )
            )

    # ── Exports ─────────────────────────────────────────────────────────────
    for match in _EXPORT_NAMED.finditer(cleaned):
        kind = match.group("kind").strip().replace(" ", "")
        info.exports.append(
            ExportedSymbol(
                name=match.group("name"),
                kind=_KIND_MAP.get(kind, "variable"),
                line=_line_of(cleaned, match.start()),
            )
        )

    for match in _EXPORT_LIST.finditer(cleaned):
        for entry in match.group("body").split(","):
            entry = entry.strip()
            if not entry or entry == "default":
                continue
            name = entry.split(" as ")[-1].strip()
            if name.isidentifier():
                info.exports.append(
                    ExportedSymbol(
                        name=name, kind="variable", line=_line_of(cleaned, match.start())
                    )
                )

    for match in _EXPORT_DEFAULT.finditer(cleaned):
        name = match.group("fn") or match.group("cls") or match.group("name")
        if name:
            info.exports.append(
                ExportedSymbol(
                    name=name,
                    kind="default",
                    line=_line_of(cleaned, match.start()),
                    is_default=True,
                )
            )

    # ── References ──────────────────────────────────────────────────────────
    export_lines = {symbol.line for symbol in info.exports}
    body = "\n".join(
        line
        for number, line in enumerate(cleaned.split("\n"), start=1)
        if number not in export_lines
    )
    info.referenced_names = set(_IDENTIFIER.findall(body))

    return info
