"""Dead-code detection over the module graph.

Findings are advisory. Static analysis cannot see dynamic imports, dependency
injection, reflection or framework conventions, so every rule here is
deliberately conservative and files that commonly act as public API surfaces or
framework entry points are exempt.
"""

from __future__ import annotations

from ai.codeintel.analyzer import RepositoryGraph
from database.enums import FindingKind, Severity

# Framework files are entry points invoked by a router or bundler, never imported.
_ENTRY_FILE_NAMES = frozenset({
    "index", "main", "app", "server", "cli", "manage", "setup", "conftest",
    "page", "layout", "route", "loading", "error", "not-found", "template",
    "middleware", "__init__", "__main__",
})

_ENTRY_DIRECTORY_HINTS = ("pages/", "app/", "routes/", "migrations/", "scripts/", "bin/")

_TEST_HINTS = ("test", "spec", "__tests__", "fixtures", "mocks", "e2e", "stories")

_MAX_FINDINGS_PER_KIND = 40


def _is_entry_point(path: str) -> bool:
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    if stem in _ENTRY_FILE_NAMES:
        return True
    return any(hint in path for hint in _ENTRY_DIRECTORY_HINTS)


def _is_test(path: str) -> bool:
    lowered = path.lower()
    return any(hint in lowered for hint in _TEST_HINTS)


def find_unused_exports(graph: RepositoryGraph) -> list[dict]:
    """Exports that no other module in the repository imports by name."""
    imported_names: dict[str, set[str]] = {}
    for path, module in graph.modules.items():
        for edge in module.imports:
            for name in edge.names:
                imported_names.setdefault(name, set()).add(path)

    findings: list[dict] = []
    for path, module in graph.modules.items():
        if module.parse_failed or _is_test(path):
            continue

        dependents = graph.dependents_of(path)
        for symbol in module.exports:
            # Used somewhere else by name?
            users = imported_names.get(symbol.name, set()) - {path}
            if users:
                continue
            # A default export from a file someone imports is reachable even
            # though the importer binds it under a different name.
            if symbol.is_default and dependents:
                continue
            # Referenced within its own module (helper used locally).
            if symbol.name in module.referenced_names:
                continue
            if _is_entry_point(path) and symbol.is_default:
                continue

            findings.append({
                "kind": FindingKind.UNUSED_EXPORT.value,
                "severity": (Severity.LOW if _is_entry_point(path) else Severity.MEDIUM).value,
                "filePath": path,
                "symbol": symbol.name,
                "symbolKind": symbol.kind,
                "line": symbol.line,
                "message": f"`{symbol.name}` is exported from {path} but never imported elsewhere.",
            })

    findings.sort(key=lambda item: (item["severity"] != Severity.MEDIUM.value, item["filePath"]))
    return findings[:_MAX_FINDINGS_PER_KIND]


def find_unreferenced_files(graph: RepositoryGraph) -> list[dict]:
    """Modules that nothing imports and that are not plausible entry points."""
    findings: list[dict] = []

    for path, module in graph.modules.items():
        if module.parse_failed or _is_test(path) or _is_entry_point(path):
            continue
        if graph.dependents_of(path):
            continue
        # A module with no exports and no dependents is likely a script.
        if not module.exports:
            continue

        findings.append({
            "kind": FindingKind.UNREFERENCED_FILE.value,
            "severity": Severity.HIGH.value if module.line_count > 80 else Severity.MEDIUM.value,
            "filePath": path,
            "symbol": None,
            "symbolKind": "module",
            "line": 1,
            "message": (
                f"{path} defines {len(module.exports)} export(s) but no other module "
                f"imports it."
            ),
        })

    findings.sort(key=lambda item: item["severity"] != Severity.HIGH.value)
    return findings[:_MAX_FINDINGS_PER_KIND]


def find_unused_imports(graph: RepositoryGraph) -> list[dict]:
    """Imported bindings never referenced in the importing module's body."""
    findings: list[dict] = []

    for path, module in graph.modules.items():
        if module.parse_failed:
            continue
        # Whether a name is used is a property of the binding, not of each
        # statement that creates it. A try/except ImportError fallback binds the
        # same name twice; reporting it twice adds nothing.
        seen: set[str] = set()
        for edge in module.imports:
            for name in edge.names:
                if name in {"*", "default"} or not name:
                    continue
                if name in module.referenced_names or name in seen:
                    continue
                seen.add(name)
                findings.append({
                    "kind": FindingKind.UNUSED_IMPORT.value,
                    "severity": Severity.LOW.value,
                    "filePath": path,
                    "symbol": name,
                    "symbolKind": "import",
                    "line": edge.line,
                    "message": f"`{name}` is imported from '{edge.specifier}' but not used.",
                })

    return findings[:_MAX_FINDINGS_PER_KIND]
