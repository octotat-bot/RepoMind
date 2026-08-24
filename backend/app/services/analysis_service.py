"""Architecture and dead-code analysis.

Both features parse the whole working tree, which is expensive, so results are
memoised per repository and the graph is built once and shared.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from ai.codeintel.analyzer import RepositoryGraph, build_graph
from ai.codeintel.architecture import build_architecture
from ai.codeintel.deadcode import (
    find_unreferenced_files,
    find_unused_exports,
    find_unused_imports,
)
from ai.codeintel.duplicates import find_duplicates
from app.core.errors import NotFoundError
from app.core.logging import get_logger
from ingest.git_clone import repo_workdir

logger = get_logger(__name__)

_CACHE_TTL_SECONDS = 900
_graph_cache: dict[str, tuple[float, RepositoryGraph]] = {}
_result_cache: dict[str, tuple[float, dict]] = {}


async def _workdir_or_raise(repository_id: str) -> Path:
    """Locate the checkout, restoring it from the database if the disk was wiped."""
    workdir = repo_workdir(repository_id)
    if workdir.exists() and any(workdir.iterdir()):
        return workdir

    from app.services.rehydrate import ensure_workdir

    restored = await ensure_workdir(repository_id)
    if restored is None:
        raise NotFoundError(
            "The repository working copy is no longer on disk. Re-index it to run analysis."
        )
    return restored


async def _get_graph(repository_id: str) -> tuple[RepositoryGraph, Path]:
    workdir = await _workdir_or_raise(repository_id)

    cached = _graph_cache.get(repository_id)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1], workdir

    graph = await asyncio.to_thread(build_graph, workdir)
    _graph_cache[repository_id] = (time.time(), graph)
    return graph, workdir


async def get_architecture(repository_id: str) -> dict:
    key = f"arch:{repository_id}"
    cached = _result_cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    graph, workdir = await _get_graph(repository_id)
    result = await asyncio.to_thread(build_architecture, workdir, graph)
    _result_cache[key] = (time.time(), result)
    return result


async def get_dead_code(repository_id: str) -> dict:
    key = f"dead:{repository_id}"
    cached = _result_cache.get(key)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    graph, workdir = await _get_graph(repository_id)

    def _analyse() -> dict:
        unused_exports = find_unused_exports(graph)
        unreferenced = find_unreferenced_files(graph)
        unused_imports = find_unused_imports(graph)
        duplicates = find_duplicates(graph, workdir)
        findings = [*unused_exports, *unreferenced, *duplicates, *unused_imports]
        return {
            "findings": findings,
            "summary": {
                "total": len(findings),
                "unusedExports": len(unused_exports),
                "unreferencedFiles": len(unreferenced),
                "duplicateUtilities": len(duplicates),
                "unusedImports": len(unused_imports),
                "modulesAnalysed": len(graph.modules),
            },
        }

    result = await asyncio.to_thread(_analyse)
    _result_cache[key] = (time.time(), result)
    return result


def invalidate(repository_id: str) -> None:
    _graph_cache.pop(repository_id, None)
    for prefix in ("arch", "dead"):
        _result_cache.pop(f"{prefix}:{repository_id}", None)
