"""Python module analysis using the standard library AST.

This is true parsing rather than pattern matching: a name is only recorded as
referenced when it appears in a ``Load`` context, so a function that is defined
but never called is correctly reported as dead.
"""

from __future__ import annotations

import ast

from ai.codeintel.models import ExportedSymbol, ImportEdge, ModuleInfo
from app.core.logging import get_logger

logger = get_logger(__name__)


class _Collector(ast.NodeVisitor):
    def __init__(self) -> None:
        self.imports: list[ImportEdge] = []
        self.exports: list[ExportedSymbol] = []
        self.referenced: set[str] = set()
        self.dunder_all: list[str] = []
        # Names bound only for annotations, plus names in string annotations —
        # both are "used" even though they never appear in a Load context.
        self.type_only: set[str] = set()
        self._depth = 0
        self._in_type_checking = False

    def visit_If(self, node: ast.If) -> None:
        """Track `if TYPE_CHECKING:` blocks, whose imports exist only for hints."""
        test = node.test
        is_type_checking = (
            (isinstance(test, ast.Name) and test.id == "TYPE_CHECKING")
            or (isinstance(test, ast.Attribute) and test.attr == "TYPE_CHECKING")
        )
        if not is_type_checking:
            self.generic_visit(node)
            return

        self.visit(test)  # the guard itself references TYPE_CHECKING
        previous = self._in_type_checking
        self._in_type_checking = True
        for child in node.body:
            self.visit(child)
        self._in_type_checking = previous
        for child in node.orelse:
            self.visit(child)

    def visit_Constant(self, node: ast.Constant) -> None:
        """Forward-reference annotations such as ``Mapped["Repository"]``."""
        if isinstance(node.value, str) and node.value.isidentifier():
            self.type_only.add(node.value)
        self.generic_visit(node)

    # ── Imports ─────────────────────────────────────────────────────────────

    def visit_Import(self, node: ast.Import) -> None:
        for alias in node.names:
            self.imports.append(
                ImportEdge(
                    specifier=alias.name,
                    names=[alias.asname or alias.name.split(".")[0]],
                    line=node.lineno,
                )
            )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        # `from __future__ import ...` is a compiler directive, not a binding.
        if node.module == "__future__":
            return
        specifier = "." * (node.level or 0) + (node.module or "")
        names = [alias.asname or alias.name for alias in node.names]
        if self._in_type_checking:
            self.type_only.update(names)
        self.imports.append(
            ImportEdge(
                specifier=specifier,
                names=names,
                line=node.lineno,
                is_relative=bool(node.level),
            )
        )
        self.generic_visit(node)

    # ── Definitions (only module-level ones count as exports) ───────────────

    def _visit_definition(self, node: ast.AST, kind: str) -> None:
        if self._depth == 0 and not node.name.startswith("_"):  # type: ignore[attr-defined]
            self.exports.append(
                ExportedSymbol(name=node.name, kind=kind, line=node.lineno)  # type: ignore[attr-defined]
            )
        self._depth += 1
        self.generic_visit(node)
        self._depth -= 1

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_definition(node, "function")

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_definition(node, "function")

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._visit_definition(node, "class")

    def visit_Assign(self, node: ast.Assign) -> None:
        if self._depth == 0:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    if target.id == "__all__":
                        self.dunder_all.extend(_string_items(node.value))
                    elif not target.id.startswith("_") and target.id.isupper():
                        self.exports.append(
                            ExportedSymbol(name=target.id, kind="variable", line=node.lineno)
                        )
        self.generic_visit(node)

    # ── References ──────────────────────────────────────────────────────────

    def visit_Name(self, node: ast.Name) -> None:
        if isinstance(node.ctx, ast.Load):
            self.referenced.add(node.id)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        self.referenced.add(node.attr)
        self.generic_visit(node)


def _string_items(node: ast.AST) -> list[str]:
    if isinstance(node, ast.List | ast.Tuple):
        return [
            element.value
            for element in node.elts
            if isinstance(element, ast.Constant) and isinstance(element.value, str)
        ]
    return []


def _suppressed_lines(source: str) -> set[int]:
    """Lines the author explicitly marked with ``# noqa`` — respect their intent."""
    return {
        number
        for number, line in enumerate(source.split("\n"), start=1)
        if "# noqa" in line or "# type: ignore" in line
    }


def analyse_python(path: str, source: str) -> ModuleInfo:
    info = ModuleInfo(path=path, language="python", line_count=source.count("\n") + 1)

    try:
        tree = ast.parse(source)
    except (SyntaxError, ValueError, RecursionError) as exc:
        logger.debug("Could not parse %s: %s", path, exc)
        info.parse_failed = True
        return info

    collector = _Collector()
    collector.visit(tree)

    suppressed = _suppressed_lines(source)
    info.imports = [edge for edge in collector.imports if edge.line not in suppressed]

    # Names listed in __all__ are deliberately re-exported, and type-only names
    # are used in annotations — both count as referenced even though they never
    # appear in a Load context.
    info.referenced_names = (
        collector.referenced | set(collector.dunder_all) | collector.type_only
    )

    # An explicit __all__ is the module's own statement of its public API.
    if collector.dunder_all:
        public = set(collector.dunder_all)
        info.exports = [symbol for symbol in collector.exports if symbol.name in public]
    else:
        info.exports = collector.exports

    return info
