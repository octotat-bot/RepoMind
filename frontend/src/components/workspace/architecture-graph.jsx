"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useAdjacency, useGraphLayout } from "@/components/workspace/use-graph-layout";
import { usePanZoom } from "@/components/workspace/use-pan-zoom";
import { NodeInspector } from "@/components/workspace/graph-inspector";
import { cn } from "@/lib/utils";

function ZoomButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-lg border border-line",
        "bg-surface/90 text-ink-subtle backdrop-blur transition-colors",
        "hover:border-line-strong hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Interactive layered dependency graph.
 *
 * Modules are stacked by dependency depth — the bottom row depends on nothing
 * else in the repository — so the shape of the codebase is readable without
 * interacting with it. Hovering isolates a module's connections; clicking pins
 * that selection and opens an inspector.
 */
export function ArchitectureGraph({ graph, onOpenFile }) {
  const { nodes, edges, groups, viewBox, maxDepth, dependencies, dependents } =
    useGraphLayout(graph);
  const neighbours = useAdjacency(edges);

  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const panZoom = usePanZoom(viewBox);

  const focused = pinned ?? hovered;
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  if (nodes.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-[13px] text-ink-subtle">
        No module relationships were detected in this repository.
      </p>
    );
  }

  const isDimmed = (id) =>
    Boolean(focused) && focused !== id && !neighbours.get(focused)?.has(id);

  const [, , vbWidth, vbHeight] = viewBox.split(" ").map(Number);
  const focusedNode = focused ? nodeById.get(focused) : null;

  return (
    <div className="space-y-3">
      {/* Legend: without it, colour and size are decoration rather than data. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {groups.map((group) => (
          <span key={group.name} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: group.color }}
              aria-hidden
            />
            <span className="font-mono text-[11px] text-ink-muted">{group.name}</span>
          </span>
        ))}
        <span className="ml-auto text-[11px] text-ink-faint">
          circle size = how connected · {maxDepth + 1} dependency layer
          {maxDepth === 0 ? "" : "s"}
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-line bg-canvas/50">
        <div className="absolute right-3 top-3 z-10 flex flex-col items-center gap-1.5">
          <ZoomButton label="Zoom in" onClick={panZoom.zoomIn} disabled={!panZoom.canZoomIn}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </ZoomButton>
          <ZoomButton label="Zoom out" onClick={panZoom.zoomOut} disabled={!panZoom.canZoomOut}>
            <Minus className="h-3.5 w-3.5" aria-hidden />
          </ZoomButton>
          <ZoomButton
            label="Reset view"
            onClick={() => {
              panZoom.reset();
              setPinned(null);
            }}
            disabled={panZoom.isDefault}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          </ZoomButton>
          {!panZoom.isDefault && (
            <span className="rounded bg-surface/90 px-1 font-mono text-[10px] tabular-nums text-ink-faint backdrop-blur">
              {Math.round(panZoom.scale * 100)}%
            </span>
          )}
        </div>

        {/* Axis label: the whole point of the layout is this ordering. */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
          <span className="text-[10px] tracking-wide text-ink-faint">ENTRY POINTS</span>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-10">
          <span className="text-[10px] tracking-wide text-ink-faint">FOUNDATIONS</span>
        </div>

        <svg
          ref={panZoom.svgRef}
          viewBox={panZoom.viewBox}
          // Matching the element's shape to the drawing's shape is what stops
          // the graph being letterboxed: a fixed height fits a tall layout by
          // height and wastes a third of the width, shrinking every label.
          // The aspect ratio comes from the *base* box so the element does not
          // change shape while zooming.
          style={{ aspectRatio: `${vbWidth} / ${vbHeight}`, maxHeight: "760px" }}
          className={cn(
            "w-full select-none",
            // pan-y keeps one-finger page scrolling while two-finger pinch is
            // handled here.
            "touch-pan-y",
            panZoom.panning ? "cursor-grabbing" : "cursor-grab",
          )}
          role="img"
          aria-label="Layered module dependency graph"
          onMouseLeave={() => setHovered(null)}
          onDoubleClick={(event) => panZoom.zoomIn(event.clientX, event.clientY)}
          onClick={() => {
            if (panZoom.consumedDrag()) return;
            setPinned(null);
          }}
          {...panZoom.handlers}
        >
          <defs>
            <marker
              id="arrow-active"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#fafafa" />
            </marker>
            <marker
              id="arrow-cycle"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#f87171" />
            </marker>
          </defs>

          <g>
            <g>
              {edges.map((edge) => {
                const dimmed = isDimmed(edge.source) && isDimmed(edge.target);
                const active = focused === edge.source || focused === edge.target;
                // Bow the line sideways so parallel edges stay distinguishable
                // and long spans do not cut straight through other nodes.
                const midX = (edge.x1 + edge.x2) / 2;
                const midY = (edge.y1 + edge.y2) / 2;
                const bow = edge.backward ? 46 : 18;

                return (
                  <path
                    key={edge.id}
                    d={`M ${edge.x1} ${edge.y1} Q ${midX + bow} ${midY} ${edge.x2} ${edge.y2}`}
                    fill="none"
                    stroke={edge.backward ? "#f87171" : active ? "#fafafa" : "#2e2e2e"}
                    strokeWidth={active ? 1.5 : edge.backward ? 1.1 : 0.9}
                    strokeDasharray={edge.backward ? "4 3" : undefined}
                    opacity={dimmed ? 0.08 : active ? 0.9 : edge.backward ? 0.7 : 0.4}
                    markerEnd={
                      active
                        ? "url(#arrow-active)"
                        : edge.backward
                          ? "url(#arrow-cycle)"
                          : undefined
                    }
                    className="transition-opacity duration-200"
                  />
                );
              })}
            </g>

            <g>
              {nodes.map((node) => {
                const dimmed = isDimmed(node.id);
                const active = focused === node.id;
                const showLabel = active || node.labelled || nodes.length <= 14;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x} ${node.y})`}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={dimmed ? 0.15 : 1}
                    onMouseEnter={() => setHovered(node.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      // A pan that happens to start on a node must not select it.
                      if (panZoom.consumedDrag()) return;
                      setPinned((current) => (current === node.id ? null : node.id));
                    }}
                  >
                    <circle
                      r={node.radius + (active ? 3 : 0)}
                      fill={node.color}
                      fillOpacity={active ? 1 : 0.75}
                      stroke={node.inCycle ? "#f87171" : active ? "#fafafa" : "#0a0a0a"}
                      strokeWidth={node.inCycle ? 2 : active ? 2 : 1.5}
                      strokeDasharray={node.inCycle ? "3 2" : undefined}
                      className="transition-all duration-200"
                    />
                    {showLabel && (
                      <text
                        y={node.radius + 12}
                        textAnchor="middle"
                        className="pointer-events-none select-none"
                        fill={active ? "#fafafa" : "#8a8a8a"}
                        fontSize={active ? 11 : 9.5}
                        fontFamily="ui-monospace, monospace"
                      >
                        {node.label.length > 20 ? `${node.label.slice(0, 19)}…` : node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {focusedNode && (
          <NodeInspector
            node={focusedNode}
            pinned={pinned === focusedNode.id}
            dependencies={(dependencies.get(focusedNode.id) ?? []).map((id) => nodeById.get(id))}
            dependents={(dependents.get(focusedNode.id) ?? []).map((id) => nodeById.get(id))}
            onSelect={setPinned}
            onOpenFile={onOpenFile}
            onClose={() => {
              setPinned(null);
              setHovered(null);
            }}
          />
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Modules are stacked by dependency depth: the bottom row depends on nothing else
        in this repository, and every row above imports from the ones below. Hover to
        isolate a module, click to pin it. Drag to pan, pinch or ⌘-scroll to zoom,
        double-click to zoom in.
        {graph?.cycles?.length > 0 && (
          <>
            {" "}
            <span className="text-critical">Dashed red</span> marks circular imports.
          </>
        )}
        {graph?.truncated &&
          ` Showing the ${nodes.length} most connected of ${graph.totalModules} modules.`}
      </p>
    </div>
  );
}
