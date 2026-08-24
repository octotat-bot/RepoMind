"""Dependency depth and circular imports.

A dependency graph laid out radially says very little: you get a cloud of dots
and no sense of what is foundational. Layering by depth answers the question a
reader actually has — what sits at the bottom that everything builds on, and
what sits at the top as an entry point.

Real codebases contain import cycles, so this cannot assume a DAG. Cycles are
condensed into components (Tarjan), the condensation is layered, and the cycles
themselves are reported: a circular import is one of the more useful things a
reader can learn about an unfamiliar repository.
"""

from __future__ import annotations

from ai.codeintel.analyzer import RepositoryGraph

_MAX_REPORTED_CYCLES = 12
_MAX_CYCLE_LENGTH = 12


def strongly_connected_components(
    nodes: list[str], edges: dict[str, set[str]]
) -> list[list[str]]:
    """Tarjan's algorithm, iterative so deep graphs cannot blow the stack."""
    index_of: dict[str, int] = {}
    low_link: dict[str, int] = {}
    on_stack: dict[str, bool] = {}
    stack: list[str] = []
    components: list[list[str]] = []
    counter = 0

    for root in nodes:
        if root in index_of:
            continue

        # Each frame is (node, iterator over its successors).
        work: list[tuple[str, list[str]]] = [(root, sorted(edges.get(root, ())))]
        index_of[root] = low_link[root] = counter
        counter += 1
        stack.append(root)
        on_stack[root] = True

        while work:
            node, successors = work[-1]

            progressed = False
            while successors:
                successor = successors.pop()
                if successor not in index_of:
                    index_of[successor] = low_link[successor] = counter
                    counter += 1
                    stack.append(successor)
                    on_stack[successor] = True
                    work.append((successor, sorted(edges.get(successor, ()))))
                    progressed = True
                    break
                if on_stack.get(successor):
                    low_link[node] = min(low_link[node], index_of[successor])

            if progressed:
                continue

            work.pop()
            if work:
                parent = work[-1][0]
                low_link[parent] = min(low_link[parent], low_link[node])

            if low_link[node] == index_of[node]:
                component: list[str] = []
                while True:
                    member = stack.pop()
                    on_stack[member] = False
                    component.append(member)
                    if member == node:
                        break
                components.append(component)

    return components


def find_cycles(graph: RepositoryGraph) -> list[list[str]]:
    """Groups of modules that import each other, directly or transitively."""
    nodes = sorted(graph.modules)
    cycles = [
        sorted(component)
        for component in strongly_connected_components(nodes, graph.edges)
        if len(component) > 1
    ]

    # Self-imports are filtered out during graph construction, so a
    # single-module component is never a cycle.
    cycles.sort(key=len, reverse=True)
    return [cycle[:_MAX_CYCLE_LENGTH] for cycle in cycles[:_MAX_REPORTED_CYCLES]]


def compute_depths(graph: RepositoryGraph, nodes: list[str]) -> dict[str, int]:
    """Depth 0 = depends on nothing else in the repository.

    Members of a cycle share a depth, since no ordering between them exists.
    Without collapsing them first, a cycle would make depth undefined.
    """
    selected = set(nodes)
    components = strongly_connected_components(nodes, graph.edges)

    component_of: dict[str, int] = {}
    for index, component in enumerate(components):
        for member in component:
            if member in selected:
                component_of[member] = index

    # Edges between components form a DAG; longest path from a source gives a
    # layer that always places a dependency below whatever imports it.
    component_edges: dict[int, set[int]] = {}
    for source, targets in graph.edges.items():
        if source not in component_of:
            continue
        for target in targets:
            if target not in component_of:
                continue
            if component_of[source] != component_of[target]:
                component_edges.setdefault(component_of[source], set()).add(
                    component_of[target]
                )

    depth_cache: dict[int, int] = {}

    def depth_of(component: int, seen: frozenset[int] = frozenset()) -> int:
        if component in depth_cache:
            return depth_cache[component]
        # `seen` guards against the pathological case of a malformed
        # condensation; a correct one is acyclic.
        if component in seen:
            return 0
        dependencies = component_edges.get(component, ())
        depth = (
            0
            if not dependencies
            else 1 + max(depth_of(other, seen | {component}) for other in dependencies)
        )
        depth_cache[component] = depth
        return depth

    return {node: depth_of(component_of[node]) for node in nodes if node in component_of}
