"""Build the whole-repository module graph that both features analyse."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ai.codeintel.js_analyzer import analyse_javascript
from ai.codeintel.models import ModuleInfo
from ai.codeintel.python_ast import analyse_python
from ai.codeintel.resolver import ModuleResolver
from app.core.logging import get_logger
from ingest.file_walker import discover_files, read_text

logger = get_logger(__name__)

_ANALYSABLE = {"python", "javascript", "jsx", "typescript", "tsx"}


@dataclass
class RepositoryGraph:
    modules: dict[str, ModuleInfo] = field(default_factory=dict)
    # importer -> set of imported repo-relative paths
    edges: dict[str, set[str]] = field(default_factory=dict)
    # imported path -> set of importers
    reverse_edges: dict[str, set[str]] = field(default_factory=dict)
    all_files: list[str] = field(default_factory=list)
    external_packages: set[str] = field(default_factory=set)

    def dependents_of(self, path: str) -> set[str]:
        return self.reverse_edges.get(path, set())

    def dependencies_of(self, path: str) -> set[str]:
        return self.edges.get(path, set())


def build_graph(root: Path) -> RepositoryGraph:
    """Parse every analysable file and resolve imports into a directed graph."""
    discovered = discover_files(root)
    graph = RepositoryGraph(all_files=[file.path for file in discovered])
    path_set = set(graph.all_files)
    resolver = ModuleResolver(path_set)

    for file in discovered:
        if file.language not in _ANALYSABLE:
            continue
        source = read_text(file.absolute)
        if source is None:
            continue

        if file.language == "python":
            module = analyse_python(file.path, source)
        else:
            module = analyse_javascript(file.path, source, file.language)
        graph.modules[file.path] = module

    for path, module in graph.modules.items():
        for edge in module.imports:
            targets = resolver.resolve_targets(
                edge.specifier, path, module.language, edge.names
            )
            if not targets:
                if not edge.specifier.startswith("."):
                    graph.external_packages.add(_package_root(edge.specifier))
                continue
            for target in targets:
                if target == path:
                    continue
                graph.edges.setdefault(path, set()).add(target)
                graph.reverse_edges.setdefault(target, set()).add(path)

    logger.info(
        "Module graph: %d modules, %d edges, %d external packages",
        len(graph.modules),
        sum(len(targets) for targets in graph.edges.values()),
        len(graph.external_packages),
    )
    return graph


def _package_root(specifier: str) -> str:
    if specifier.startswith("@"):
        parts = specifier.split("/")
        return "/".join(parts[:2]) if len(parts) >= 2 else specifier
    return specifier.split("/")[0].split(".")[0]
