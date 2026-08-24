"use client";

import { ArrowDownLeft, ArrowUpRight, FileCode2, RotateCw, X } from "lucide-react";
import { cn, splitPath } from "@/lib/utils";

function RelatedList({ title, icon: Icon, modules, onSelect, empty }) {
  return (
    <div>
      <p className="mb-1 inline-flex items-center gap-1 text-[10px] tracking-wide text-ink-faint">
        <Icon className="h-3 w-3" aria-hidden />
        {title}
        {modules.length > 0 && <span className="text-ink-subtle">({modules.length})</span>}
      </p>

      {modules.length === 0 ? (
        <p className="text-[11px] text-ink-subtle">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {modules.slice(0, 6).map((module) => (
            <li key={module.id}>
              <button
                type="button"
                onClick={() => onSelect(module.id)}
                title={module.path}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-hover"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: module.color }}
                  aria-hidden
                />
                <span className="truncate font-mono text-[11px] text-ink-muted">
                  {module.label}
                </span>
              </button>
            </li>
          ))}
          {modules.length > 6 && (
            <li className="px-1 text-[10.5px] text-ink-faint">
              +{modules.length - 6} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Detail card for the focused module.
 *
 * A graph shows that connections exist; this says what they are, and makes them
 * navigable — clicking a related module moves the focus there, so the graph can
 * be explored one hop at a time.
 */
export function NodeInspector({
  node,
  pinned,
  dependencies = [],
  dependents = [],
  onSelect,
  onOpenFile,
  onClose,
}) {
  const { directory, name } = splitPath(node.path);
  const known = (list) => list.filter(Boolean);

  return (
    <div
      className={cn(
        "absolute bottom-3 left-3 z-10 w-[290px] rounded-xl border border-line",
        "bg-surface/95 p-3 shadow-2xl backdrop-blur",
        !pinned && "pointer-events-none",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ background: node.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px] text-ink">{name}</p>
          {directory && (
            <p className="truncate font-mono text-[10px] text-ink-faint">{directory}</p>
          )}
        </div>
        {pinned && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Clear selection"
            className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-subtle">
        <span>layer {node.depth}</span>
        <span>{node.lines} lines</span>
        {node.inCycle && (
          <span className="inline-flex items-center gap-1 text-critical">
            <RotateCw className="h-3 w-3" aria-hidden />
            circular
          </span>
        )}
      </div>

      {pinned && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-2.5">
            <RelatedList
              title="IMPORTS"
              icon={ArrowDownLeft}
              modules={known(dependencies)}
              onSelect={onSelect}
              empty="Nothing in this repo."
            />
            <RelatedList
              title="IMPORTED BY"
              icon={ArrowUpRight}
              modules={known(dependents)}
              onSelect={onSelect}
              empty="Nothing — likely an entry point."
            />
          </div>

          <button
            type="button"
            onClick={() => onOpenFile?.({ filePath: node.path })}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2 py-1.5 text-[11.5px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden />
            Open file
          </button>
        </>
      )}
    </div>
  );
}
