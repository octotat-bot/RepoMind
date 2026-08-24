"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileSearch, FolderTree, X } from "lucide-react";
import { FileMatches, FileTree } from "@/components/workspace/file-tree";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useDebouncedValue, useKeyboardShortcut } from "@/lib/hooks";
import { cn, formatNumber } from "@/lib/utils";

const MAX_MATCHES = 200;

/** Depth-first walk collecting files whose path matches the filter. */
function collectMatches(node, needle, into = []) {
  if (into.length >= MAX_MATCHES) return into;
  if (node.type === "file") {
    if (node.path.toLowerCase().includes(needle)) into.push(node);
    return into;
  }
  for (const child of node.children ?? []) collectMatches(child, needle, into);
  return into;
}

/** Paths of every ancestor directory of `filePath`, so it can be revealed. */
function ancestorsOf(filePath) {
  const segments = filePath.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function FileExplorer({ tree, fileCount, loading, activePath, onSelect }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const inputRef = useRef(null);
  const debouncedQuery = useDebouncedValue(query, 180);

  const roots = useMemo(() => tree?.children ?? [], [tree]);

  // Open the first level once the tree arrives so the panel is never a blank list.
  useEffect(() => {
    if (!roots.length) return;
    setExpanded((current) => {
      if (current.size > 0) return current;
      return new Set(
        roots.filter((node) => node.type === "directory").map((node) => node.path),
      );
    });
  }, [roots]);

  // Reveal the active file when it is opened from a citation elsewhere.
  useEffect(() => {
    if (!activePath) return;
    setExpanded((current) => {
      const next = new Set(current);
      for (const ancestor of ancestorsOf(activePath)) next.add(ancestor);
      return next;
    });
  }, [activePath]);

  useKeyboardShortcut("f", () => inputRef.current?.focus(), { meta: true, shift: true });

  const toggle = (path) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const needle = debouncedQuery.trim().toLowerCase();
  const matches = useMemo(
    () => (needle && tree ? collectMatches(tree, needle) : []),
    [needle, tree],
  );

  return (
    <div className="flex h-full flex-col bg-surface/30">
      <header className="shrink-0 border-b border-line px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            <FolderTree className="h-3.5 w-3.5" aria-hidden />
            EXPLORER
          </span>
          <span className="font-mono text-[10.5px] text-ink-faint">
            {formatNumber(fileCount ?? 0)} files
          </span>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5",
            "transition-colors focus-within:border-white/20 hover:border-line-strong",
          )}
        >
          <FileSearch className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setQuery("")}
            placeholder="Filter files…"
            aria-label="Filter files"
            spellCheck={false}
            className="h-8 min-w-0 flex-1 bg-transparent font-mono text-[12px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-1.5">
        {loading ? (
          <div className="space-y-1.5 p-1.5">
            {Array.from({ length: 14 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-4"
                style={{ width: `${55 + ((index * 13) % 40)}%` }}
              />
            ))}
          </div>
        ) : needle ? (
          matches.length > 0 ? (
            <>
              <p className="px-2 py-1.5 text-[10.5px] text-ink-faint">
                {matches.length === MAX_MATCHES ? `${MAX_MATCHES}+` : matches.length} matching
              </p>
              <FileMatches matches={matches} onSelect={onSelect} activePath={activePath} />
            </>
          ) : (
            <EmptyState
              icon={FileSearch}
              title="No matching files"
              description={`Nothing in this repository matches “${debouncedQuery}”.`}
              className="py-10"
            />
          )
        ) : (
          <FileTree
            nodes={roots}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelect}
            activePath={activePath}
          />
        )}
      </div>
    </div>
  );
}
