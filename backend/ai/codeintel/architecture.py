"""Derive an architecture view: modules, dependencies, layout and tech stack."""

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

from ai.codeintel.analyzer import RepositoryGraph
from ai.codeintel.layering import compute_depths, find_cycles
from app.core.shared_config import tech_stack_signals

_MAX_NODES = 60
_MAX_EDGES = 220


def detect_tech_stack(root: Path, graph: RepositoryGraph) -> list[str]:
    """Identify frameworks from marker files and imported packages."""
    stack: list[str] = []

    for marker, label in tech_stack_signals().items():
        if (root / marker).exists() and label not in stack:
            stack.append(label)

    package_labels = {
        "react": "React",
        "next": "Next.js",
        "vue": "Vue",
        "svelte": "Svelte",
        "express": "Express",
        "fastapi": "FastAPI",
        "flask": "Flask",
        "django": "Django",
        "sqlalchemy": "SQLAlchemy",
        "prisma": "Prisma",
        "@prisma": "Prisma",
        "tailwindcss": "Tailwind CSS",
        "torch": "PyTorch",
        "tensorflow": "TensorFlow",
        "numpy": "NumPy",
        "pandas": "pandas",
        "langchain": "LangChain",
        "faiss": "FAISS",
        "redis": "Redis",
        "celery": "Celery",
        "pytest": "pytest",
        "jest": "Jest",
        "vitest": "Vitest",
    }
    for package in graph.external_packages:
        label = package_labels.get(package.lower())
        if label and label not in stack:
            stack.append(label)

    languages = Counter(module.language for module in graph.modules.values())
    for language, _ in languages.most_common(3):
        label = {"tsx": "TypeScript", "typescript": "TypeScript",
                 "jsx": "JavaScript", "javascript": "JavaScript",
                 "python": "Python"}.get(language)
        if label and label not in stack:
            stack.append(label)

    return stack[:14]


def folder_hierarchy(graph: RepositoryGraph, max_depth: int = 2) -> list[dict]:
    """Aggregate files into top-level modules for the overview panel."""
    buckets: dict[str, dict] = {}

    for path in graph.all_files:
        parts = path.split("/")
        key = "/".join(parts[:max_depth]) if len(parts) > max_depth else (
            parts[0] if len(parts) > 1 else "(root)"
        )
        bucket = buckets.setdefault(key, {"path": key, "files": 0, "languages": Counter()})
        bucket["files"] += 1
        if module := graph.modules.get(path):
            bucket["languages"][module.language] += 1

    hierarchy = [
        {
            "path": bucket["path"],
            "files": bucket["files"],
            "language": (bucket["languages"].most_common(1) or [("other", 0)])[0][0],
        }
        for bucket in buckets.values()
    ]
    hierarchy.sort(key=lambda item: item["files"], reverse=True)
    return hierarchy[:24]


def _group_of(path: str) -> str:
    parts = path.split("/")
    return parts[0] if len(parts) > 1 else "(root)"


def dependency_graph(graph: RepositoryGraph) -> dict:
    """Build a renderable node/edge graph.

    Large repositories produce graphs no human can read, so nodes are ranked by
    connectivity and only the most central modules are kept.

    Each node carries its dependency depth so the client can lay the graph out
    in layers — foundational modules at the bottom, entry points at the top —
    which conveys far more than a cloud of dots.
    """
    degree: dict[str, int] = defaultdict(int)
    for source, targets in graph.edges.items():
        degree[source] += len(targets)
        for target in targets:
            degree[target] += 1

    ranked = sorted(graph.modules.keys(), key=lambda path: degree.get(path, 0), reverse=True)
    kept = ranked[:_MAX_NODES]
    selected = set(kept)

    depths = compute_depths(graph, kept)
    cycles = find_cycles(graph)
    in_cycle = {member for cycle in cycles for member in cycle}

    nodes = []
    for path in kept:
        module = graph.modules[path]
        nodes.append({
            "id": path,
            "label": path.split("/")[-1],
            "path": path,
            "group": _group_of(path),
            "language": module.language,
            "imports": len(graph.dependencies_of(path)),
            "importedBy": len(graph.dependents_of(path)),
            "degree": degree.get(path, 0),
            "lines": module.line_count,
            "depth": depths.get(path, 0),
            "inCycle": path in in_cycle,
        })

    edges = []
    for source, targets in graph.edges.items():
        if source not in selected:
            continue
        for target in targets:
            if target in selected:
                edges.append({"source": source, "target": target})
                if len(edges) >= _MAX_EDGES:
                    break
        if len(edges) >= _MAX_EDGES:
            break

    return {
        "nodes": nodes,
        "edges": edges,
        "truncated": len(graph.modules) > _MAX_NODES,
        "totalModules": len(graph.modules),
        "maxDepth": max(depths.values(), default=0),
        # Circular imports are among the more useful things to learn about an
        # unfamiliar repository, so they are surfaced rather than smoothed over.
        "cycles": cycles,
    }


def module_relationships(graph: RepositoryGraph) -> list[dict]:
    """Roll file-level edges up to directory-level relationships."""
    counts: Counter[tuple[str, str]] = Counter()

    for source, targets in graph.edges.items():
        source_group = _group_of(source)
        for target in targets:
            target_group = _group_of(target)
            if source_group != target_group:
                counts[(source_group, target_group)] += 1

    return [
        {"source": source, "target": target, "weight": weight}
        for (source, target), weight in counts.most_common(40)
    ]


def entry_points(graph: RepositoryGraph) -> list[str]:
    """Modules nothing imports but which import others — likely roots."""
    candidates = [
        path
        for path in graph.modules
        if not graph.dependents_of(path) and graph.dependencies_of(path)
    ]
    candidates.sort(key=lambda path: len(graph.dependencies_of(path)), reverse=True)
    return candidates[:12]


def build_architecture(root: Path, graph: RepositoryGraph) -> dict:
    return {
        "techStack": detect_tech_stack(root, graph),
        "hierarchy": folder_hierarchy(graph),
        "graph": dependency_graph(graph),
        "relationships": module_relationships(graph),
        "entryPoints": entry_points(graph),
        "stats": {
            "modules": len(graph.modules),
            "files": len(graph.all_files),
            "edges": sum(len(targets) for targets in graph.edges.values()),
            "externalPackages": len(graph.external_packages),
        },
    }
