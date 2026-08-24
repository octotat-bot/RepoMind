"use client";

import { useMemo } from "react";

const MIN_RADIUS = 5;
const MAX_RADIUS = 16;

// Layout is computed in an abstract coordinate space and then fitted to the
// viewport by the SVG viewBox, so these are ratios rather than pixels.
const LAYER_HEIGHT = 98;
const NODE_PITCH = 104;

// A wide layer forces the whole drawing to be scaled down to fit a narrow
// panel, which is what makes labels unreadable. Splitting long layers across
// sub-rows keeps the drawing roughly square and legible instead.
const MAX_PER_ROW = 7;
const SUB_ROW_HEIGHT = 52;

// Labelling every node in a dense row produces overlapping text that reads as
// noise, so only the most connected modules are named unprompted.
const LABEL_COUNT = 8;

/**
 * Distinct hues for top-level directories.
 *
 * Language is a poor encoding in practice: most repositories are overwhelmingly
 * one language, so colouring by it makes every node identical. The directory a
 * module lives in is what actually varies and what a reader is looking for.
 */
const GROUP_COLORS = [
  "#60a5fa", "#f472b6", "#4ade80", "#fbbf24", "#a78bfa",
  "#22d3ee", "#fb923c", "#f87171", "#34d399", "#c084fc",
];

export function groupColor(index) {
  return GROUP_COLORS[index % GROUP_COLORS.length];
}

/**
 * Order nodes within each layer to reduce edge crossings.
 *
 * Standard barycenter heuristic: repeatedly place each node at the average
 * position of its neighbours in the adjacent layer. A few passes gets most of
 * the benefit; this is layout, not an optimisation problem worth solving
 * exactly.
 */
function orderLayers(layers, neighboursOf, passes = 4) {
  const positionOf = new Map();
  for (const layer of layers) {
    layer.forEach((node, index) => positionOf.set(node.id, index));
  }

  for (let pass = 0; pass < passes; pass += 1) {
    // Alternate direction so ordering information propagates both ways.
    const ordered = pass % 2 === 0 ? layers : [...layers].reverse();

    for (const layer of ordered) {
      const barycentre = new Map();
      for (const node of layer) {
        const neighbours = neighboursOf(node.id);
        if (!neighbours.length) {
          barycentre.set(node.id, positionOf.get(node.id) ?? 0);
          continue;
        }
        const total = neighbours.reduce(
          (sum, id) => sum + (positionOf.get(id) ?? 0),
          0,
        );
        barycentre.set(node.id, total / neighbours.length);
      }

      layer.sort((a, b) => barycentre.get(a.id) - barycentre.get(b.id));
      layer.forEach((node, index) => positionOf.set(node.id, index));
    }
  }

  return layers;
}

/**
 * Layered ("Sugiyama-style") dependency layout.
 *
 * Modules are stacked by dependency depth: the bottom row depends on nothing
 * else in the repository, and each row above imports from the ones below. That
 * makes the shape of the codebase legible at a glance — which modules are
 * foundational, which are entry points, and how deep the layering goes.
 */
export function useGraphLayout(graph) {
  return useMemo(() => {
    const rawNodes = graph?.nodes ?? [];
    const rawEdges = graph?.edges ?? [];
    if (rawNodes.length === 0) {
      return { nodes: [], edges: [], groups: [], viewBox: null, maxDepth: 0 };
    }

    const groupNames = [...new Set(rawNodes.map((node) => node.group))].sort();
    const groupIndex = new Map(groupNames.map((name, index) => [name, index]));

    const present = new Set(rawNodes.map((node) => node.id));
    const edges = rawEdges.filter(
      (edge) => present.has(edge.source) && present.has(edge.target),
    );

    const dependencies = new Map();
    const dependents = new Map();
    for (const edge of edges) {
      if (!dependencies.has(edge.source)) dependencies.set(edge.source, []);
      if (!dependents.has(edge.target)) dependents.set(edge.target, []);
      dependencies.get(edge.source).push(edge.target);
      dependents.get(edge.target).push(edge.source);
    }

    // Bucket by depth. The backend guarantees members of a cycle share one.
    const maxDepth = Math.max(0, ...rawNodes.map((node) => node.depth ?? 0));
    const layers = Array.from({ length: maxDepth + 1 }, () => []);
    for (const node of rawNodes) {
      layers[Math.min(node.depth ?? 0, maxDepth)].push(node);
    }

    // Seed each layer grouped by directory so related modules start adjacent,
    // then let the barycentre pass refine it.
    for (const layer of layers) {
      layer.sort(
        (a, b) =>
          (groupIndex.get(a.group) ?? 0) - (groupIndex.get(b.group) ?? 0) ||
          (b.degree ?? 0) - (a.degree ?? 0),
      );
    }

    orderLayers(layers, (id) => [
      ...(dependencies.get(id) ?? []),
      ...(dependents.get(id) ?? []),
    ]);

    // Wrapping splits a layer into equal rows, so a layer of 11 becomes two
    // rows of 6, not 7 + 4. The canvas must be sized from that real row length;
    // using the cap instead leaves every row centred in a canvas wider than
    // anything drawn in it, and the whole graph renders letterboxed.
    const rowPlan = layers.map((layer) => {
      const rowCount = Math.max(1, Math.ceil(layer.length / MAX_PER_ROW));
      return { rowCount, perRow: Math.ceil(layer.length / rowCount) };
    });
    const widestRow = Math.max(1, ...rowPlan.map((plan) => plan.perRow));
    const canvasWidth = Math.max(widestRow - 1, 1) * NODE_PITCH;
    const maxDegree = Math.max(1, ...rawNodes.map((node) => node.degree ?? 0));

    const labelled = new Set(
      [...rawNodes]
        .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
        .slice(0, LABEL_COUNT)
        .map((node) => node.id),
    );

    // Layers are laid out bottom-up so a wrapped layer's extra sub-rows push
    // everything above it up, rather than overlapping the next layer.
    const positioned = new Map();
    let cursorY = 0;

    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const layer = layers[depth];
      if (!layer.length) continue;

      const { rowCount, perRow } = rowPlan[depth];

      for (let row = 0; row < rowCount; row += 1) {
        const members = layer.slice(row * perRow, (row + 1) * perRow);
        // One pitch for every row, with shorter rows centred. Scaling the gap
        // to each row's length instead would leave the widest row short of the
        // canvas edges, and the whole drawing gets letterboxed as a result.
        const rowWidth = (members.length - 1) * NODE_PITCH;
        const startX = (canvasWidth - rowWidth) / 2;
        // Later sub-rows sit slightly above, keeping the layer visually one band.
        const y = -(cursorY + (rowCount - 1 - row) * SUB_ROW_HEIGHT);

        members.forEach((node, index) => {
          positioned.set(node.id, {
            ...node,
            x: startX + index * NODE_PITCH,
            y,
            color: groupColor(groupIndex.get(node.group) ?? 0),
            labelled: labelled.has(node.id),
            radius:
              MIN_RADIUS +
              (MAX_RADIUS - MIN_RADIUS) * Math.sqrt((node.degree ?? 0) / maxDegree),
          });
        });
      }

      cursorY += LAYER_HEIGHT + (rowCount - 1) * SUB_ROW_HEIGHT;
    }

    const laidOutNodes = [...positioned.values()];

    const laidOutEdges = edges
      .map((edge, index) => {
        const source = positioned.get(edge.source);
        const target = positioned.get(edge.target);
        if (!source || !target) return null;
        return {
          id: `${edge.source}->${edge.target}#${index}`,
          source: edge.source,
          target: edge.target,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          // An edge pointing upward means a module imports something that sits
          // above it, which only happens inside a cycle.
          backward: target.y <= source.y,
        };
      })
      .filter(Boolean);

    const padding = 56;
    const xs = laidOutNodes.map((node) => node.x);
    const ys = laidOutNodes.map((node) => node.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;
    const width = Math.max(Math.max(...xs) + padding - minX, 240);
    const height = Math.max(Math.max(...ys) + padding - minY, 200);

    return {
      nodes: laidOutNodes,
      edges: laidOutEdges,
      groups: groupNames.map((name, index) => ({ name, color: groupColor(index) })),
      viewBox: `${minX} ${minY} ${width} ${height}`,
      maxDepth,
      dependencies,
      dependents,
    };
  }, [graph]);
}

/** Adjacency lookup used to dim everything unrelated to the focused node. */
export function useAdjacency(edges) {
  return useMemo(() => {
    const neighbours = new Map();
    for (const edge of edges) {
      if (!neighbours.has(edge.source)) neighbours.set(edge.source, new Set());
      if (!neighbours.has(edge.target)) neighbours.set(edge.target, new Set());
      neighbours.get(edge.source).add(edge.target);
      neighbours.get(edge.target).add(edge.source);
    }
    return neighbours;
  }, [edges]);
}
