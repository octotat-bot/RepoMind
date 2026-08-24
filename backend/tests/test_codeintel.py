"""Static analysis: AST parsing, module resolution and dead-code rules."""

from __future__ import annotations

from ai.codeintel.analyzer import build_graph
from ai.codeintel.architecture import build_architecture
from ai.codeintel.layering import compute_depths, find_cycles
from ai.codeintel.deadcode import find_unreferenced_files, find_unused_exports, find_unused_imports
from ai.codeintel.js_analyzer import analyse_javascript
from ai.codeintel.python_ast import analyse_python
from ai.codeintel.resolver import ModuleResolver


# ── Python AST ───────────────────────────────────────────────────────────────

def test_python_imports_and_exports() -> None:
    source = """
import os
from pathlib import Path
from .sibling import helper

def public_function():
    return Path(os.getcwd())

class PublicClass:
    pass

def _private():
    pass
"""
    info = analyse_python("pkg/module.py", source)

    exported = {symbol.name for symbol in info.exports}
    assert "public_function" in exported
    assert "PublicClass" in exported
    assert "_private" not in exported  # underscore-prefixed names are private

    specifiers = {edge.specifier for edge in info.imports}
    assert {"os", "pathlib", ".sibling"} <= specifiers


def test_future_import_is_not_a_binding() -> None:
    info = analyse_python("m.py", "from __future__ import annotations\nx = 1\n")
    assert all(edge.specifier != "__future__" for edge in info.imports)


def test_dunder_all_defines_the_public_api() -> None:
    source = """
__all__ = ["keep"]

def keep():
    pass

def also_public():
    pass
"""
    info = analyse_python("m.py", source)
    assert {symbol.name for symbol in info.exports} == {"keep"}


def test_type_checking_imports_count_as_used() -> None:
    """Imports under TYPE_CHECKING exist only for annotations."""
    source = """
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from other import Thing

def f(value: "Thing") -> None:
    pass
"""
    info = analyse_python("m.py", source)
    assert "Thing" in info.referenced_names
    assert "TYPE_CHECKING" in info.referenced_names


def test_noqa_suppresses_a_finding() -> None:
    info = analyse_python("m.py", "import sideeffect  # noqa: F401\n")
    assert info.imports == []


def test_syntax_errors_are_reported_not_raised() -> None:
    info = analyse_python("broken.py", "def oops(\n")
    assert info.parse_failed is True


# ── JavaScript ───────────────────────────────────────────────────────────────

def test_javascript_imports_and_exports() -> None:
    source = """
import React from 'react';
import { useState, useEffect as onMount } from 'react';
import styles from './styles.css';
const lodash = require('lodash');

export function namedFunction() {}
export const Component = () => null;
export class Widget {}
export default namedFunction;
"""
    info = analyse_javascript("src/app.jsx", source, "jsx")

    exported = {symbol.name for symbol in info.exports}
    assert {"namedFunction", "Component", "Widget"} <= exported

    specifiers = {edge.specifier for edge in info.imports}
    assert {"react", "./styles.css", "lodash"} <= specifiers

    # `useEffect as onMount` binds onMount, not useEffect
    react_names = {name for edge in info.imports if edge.specifier == "react" for name in edge.names}
    assert "onMount" in react_names


def test_commented_out_imports_are_ignored() -> None:
    source = """
// import { ghost } from './ghost';
/* import { phantom } from './phantom'; */
import { real } from './real';
"""
    info = analyse_javascript("a.js", source)
    specifiers = {edge.specifier for edge in info.imports}
    assert specifiers == {"./real"}


# ── Resolution ───────────────────────────────────────────────────────────────

def test_javascript_resolution_handles_extensions_and_aliases() -> None:
    files = {"src/app.jsx", "src/lib/utils.js", "src/components/index.jsx"}
    resolver = ModuleResolver(files)

    assert resolver.resolve_js("./lib/utils", "src/app.jsx") == "src/lib/utils.js"
    assert resolver.resolve_js("./components", "src/app.jsx") == "src/components/index.jsx"
    assert resolver.resolve_js("@/lib/utils", "src/app.jsx") == "src/lib/utils.js"
    assert resolver.resolve_js("react", "src/app.jsx") is None


def test_python_package_submodule_resolution() -> None:
    """`from package import submodule` depends on the submodule file.

    The package's __init__.py may be empty and therefore never indexed, so
    resolution must not depend on it existing.
    """
    files = {"vectorstore/registry.py", "vectorstore/faiss_store.py", "app/main.py"}
    resolver = ModuleResolver(files)

    targets = resolver.resolve_targets("vectorstore", "app/main.py", "python", ["registry"])
    assert "vectorstore/registry.py" in targets


def test_python_relative_resolution() -> None:
    files = {"pkg/a.py", "pkg/b.py", "pkg/sub/c.py"}
    resolver = ModuleResolver(files)
    assert resolver.resolve_python(".b", "pkg/a.py") == "pkg/b.py"
    assert resolver.resolve_python("..a", "pkg/sub/c.py") == "pkg/a.py"


# ── Graph and dead code over a synthetic repository ──────────────────────────

def build_sample_repo(root):
    (root / "pkg").mkdir(parents=True)
    (root / "pkg" / "__init__.py").write_text("# package\n")
    (root / "pkg" / "core.py").write_text(
        "def used_helper():\n    return 1\n\n\ndef orphan_helper():\n    return 2\n"
    )
    (root / "pkg" / "app.py").write_text(
        "from pkg.core import used_helper\n\n\ndef main():\n    return used_helper()\n"
    )
    (root / "pkg" / "stranded.py").write_text(
        "def nobody_calls_me():\n    return 3\n\n\nclass AlsoUnused:\n    pass\n"
    )
    return root


def test_graph_edges_and_dead_code(tmp_path) -> None:
    root = build_sample_repo(tmp_path)
    graph = build_graph(root)

    assert "pkg/core.py" in graph.dependencies_of("pkg/app.py")
    assert "pkg/app.py" in graph.dependents_of("pkg/core.py")

    unused = {finding["symbol"] for finding in find_unused_exports(graph)}
    assert "orphan_helper" in unused
    assert "used_helper" not in unused

    unreferenced = {finding["filePath"] for finding in find_unreferenced_files(graph)}
    assert "pkg/stranded.py" in unreferenced
    assert "pkg/core.py" not in unreferenced


def test_no_false_positive_unused_imports(tmp_path) -> None:
    root = build_sample_repo(tmp_path)
    graph = build_graph(root)
    assert find_unused_imports(graph) == []


def test_conditional_import_fallback_is_reported_once(tmp_path) -> None:
    """try/except ImportError binds one name twice — that is still one finding."""
    (tmp_path / "compat.py").write_text(
        "try:\n"
        "    from StringIO import StringIO\n"
        "except ImportError:\n"
        "    from io import StringIO\n"
    )
    findings = find_unused_imports(build_graph(tmp_path))
    assert [finding["symbol"] for finding in findings] == ["StringIO"]


def test_architecture_summary(tmp_path) -> None:
    root = build_sample_repo(tmp_path)
    architecture = build_architecture(root, build_graph(root))

    assert architecture["stats"]["modules"] >= 3
    assert architecture["graph"]["nodes"]
    assert "Python" in architecture["techStack"]


# ── Dependency layering and circular imports ─────────────────────────────────


def build_layered_repo(root):
    """base <- middle <- top: a three-level dependency chain."""
    (root / "base.py").write_text("def helper():\n    return 1\n")
    (root / "middle.py").write_text("from base import helper\n\n\ndef mid():\n    return helper()\n")
    (root / "top.py").write_text("from middle import mid\n\n\ndef run():\n    return mid()\n")
    return root


def test_depth_places_dependencies_below_dependents(tmp_path) -> None:
    graph = build_graph(build_layered_repo(tmp_path))
    depths = compute_depths(graph, sorted(graph.modules))

    assert depths["base.py"] == 0, "a module importing nothing is foundational"
    assert depths["middle.py"] == 1
    assert depths["top.py"] == 2


def test_no_cycles_in_an_acyclic_repository(tmp_path) -> None:
    assert find_cycles(build_graph(build_layered_repo(tmp_path))) == []


def test_circular_imports_are_detected(tmp_path) -> None:
    (tmp_path / "alpha.py").write_text("import beta\n\n\ndef a():\n    return beta.b()\n")
    (tmp_path / "beta.py").write_text("import alpha\n\n\ndef b():\n    return alpha.a()\n")

    cycles = find_cycles(build_graph(tmp_path))
    assert len(cycles) == 1
    assert set(cycles[0]) == {"alpha.py", "beta.py"}


def test_depth_is_defined_even_with_a_cycle(tmp_path) -> None:
    """Members of a cycle share a depth; without collapsing, depth is undefined."""
    (tmp_path / "alpha.py").write_text("import beta\n")
    (tmp_path / "beta.py").write_text("import alpha\n")
    (tmp_path / "user.py").write_text("import alpha\n\n\ndef go():\n    pass\n")

    graph = build_graph(tmp_path)
    depths = compute_depths(graph, sorted(graph.modules))

    assert depths["alpha.py"] == depths["beta.py"]
    assert depths["user.py"] > depths["alpha.py"]


def test_architecture_exposes_layers_and_cycles(tmp_path) -> None:
    architecture = build_architecture(build_layered_repo(tmp_path), build_graph(tmp_path))
    dependency_graph = architecture["graph"]

    assert dependency_graph["maxDepth"] == 2
    assert dependency_graph["cycles"] == []
    assert all("depth" in node and "inCycle" in node for node in dependency_graph["nodes"])
