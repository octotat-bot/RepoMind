"use client";

import { useEffect, useRef } from "react";
import { FileX2, WrapText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { CodeLines } from "@/components/workspace/code-lines";
import { CopyButton } from "@/components/workspace/copy-button";
import { api } from "@/lib/api";
import { languageColor } from "@/lib/constants";
import { useAsync, useLocalStorage } from "@/lib/hooks";
import { cn, formatBytes, formatNumber, splitPath } from "@/lib/utils";

/**
 * Source viewer for one file, optionally scrolled to a cited line range.
 *
 * `highlight` is the range a citation pointed at; the viewer centres it on load
 * so clicking a citation lands on the code it refers to, not the top of a
 * 2000-line file.
 */
export function FileViewer({ repositoryId, path, highlight, onClose }) {
  const scrollRef = useRef(null);
  const [wrap, setWrap] = useLocalStorage("repomind.viewer.wrap", false);

  const { data, error, loading } = useAsync(
    () => api.repos.file(repositoryId, path),
    [repositoryId, path],
  );

  useEffect(() => {
    if (!data || !highlight?.start) return;
    // Wait for the highlighted rows to exist before scrolling to them.
    const frame = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector(`[data-line="${highlight.start}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [data, highlight?.start, highlight?.end]);

  const { directory, name } = splitPath(path);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: languageColor(data?.language) }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[12px]">
            {directory && <span className="text-ink-faint">{directory}/</span>}
            <span className="text-ink">{name}</span>
          </p>
        </div>

        {data && (
          <span className="hidden shrink-0 items-center gap-2.5 font-mono text-[10.5px] text-ink-faint sm:flex">
            <span>{formatNumber(data.lineCount)} lines</span>
            <span>{formatBytes(data.sizeBytes)}</span>
          </span>
        )}

        <button
          type="button"
          onClick={() => setWrap((value) => !value)}
          aria-pressed={wrap}
          title={wrap ? "Disable soft wrap" : "Enable soft wrap"}
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
            wrap ? "bg-surface-hover text-ink" : "text-ink-faint hover:bg-surface-hover hover:text-ink",
          )}
        >
          <WrapText className="h-3.5 w-3.5" aria-hidden />
        </button>
        <CopyButton value={data?.content ?? ""} label="Copy file contents" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </header>

      {highlight?.start && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-raised/50 px-3 py-1.5">
          <span className="font-mono text-[10.5px] text-ink-subtle">
            Showing cited lines {highlight.start}–{highlight.end}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-[10.5px]"
            onClick={() =>
              scrollRef.current
                ?.querySelector(`[data-line="${highlight.start}"]`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" })
            }
          >
            Jump to it
          </Button>
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-canvas/40 py-2">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 18 }).map((_, index) => (
              <Skeleton
                key={index}
                className="h-3"
                style={{ width: `${40 + ((index * 17) % 55)}%` }}
              />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={FileX2}
            title="Could not open this file"
            description={error.message}
            className="py-16"
          />
        ) : (
          <CodeLines
            code={data.content}
            language={data.language}
            startLine={1}
            showLineNumbers
            wrap={wrap}
            highlight={highlight}
          />
        )}
      </div>
    </div>
  );
}
