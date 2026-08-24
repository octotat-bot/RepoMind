"use client";

import { useState } from "react";
import { ChevronDown, Crosshair } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { CodeLines } from "@/components/workspace/code-lines";
import { CopyButton } from "@/components/workspace/copy-button";
import { languageColor } from "@/lib/constants";
import { cn, splitPath } from "@/lib/utils";

function ChunkCard({ chunk, onOpenFile, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const { directory, name } = splitPath(chunk.filePath);
  const similarity = Math.round((chunk.vectorScore ?? chunk.score ?? 0) * 100);

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-2 p-2.5">
        <span className="mt-0.5 flex h-4 min-w-4 items-center justify-center rounded bg-ink px-1 font-mono text-[9.5px] font-semibold text-canvas">
          {chunk.rank}
        </span>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: languageColor(chunk.language) }}
              aria-hidden
            />
            <span className="truncate font-mono text-[11.5px] text-ink">{name}</span>
          </span>
          {directory && (
            <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-faint">
              {directory}
            </span>
          )}
          <span className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[10px] text-ink-faint">
              L{chunk.startLine}–{chunk.endLine}
            </span>
            <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-hover">
              <span className="block h-full rounded-full bg-ink/70" style={{ width: `${similarity}%` }} />
            </span>
            <span className="font-mono text-[10px] tabular-nums text-ink-subtle">{similarity}%</span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onOpenFile?.(chunk)}
            aria-label={`Open ${chunk.filePath}`}
            title="Open in viewer"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </button>
          <CopyButton value={chunk.content ?? ""} label="Copy chunk" />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? "Collapse chunk" : "Expand chunk"}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")}
              aria-hidden
            />
          </button>
        </div>
      </div>

      {open && (
        <div className="max-h-[240px] overflow-auto border-t border-line bg-canvas/50">
          <CodeLines
            code={chunk.content ?? ""}
            language={chunk.language}
            startLine={chunk.startLine}
            showLineNumbers
          />
        </div>
      )}
    </li>
  );
}

/** The exact evidence the current answer was grounded in. */
export function RetrievedChunks({ chunks = [], onOpenFile }) {
  if (chunks.length === 0) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No context yet"
        description="Ask a question and the chunks retrieved from the vector index will appear here, ranked by similarity."
        className="py-12"
      />
    );
  }

  return (
    <div className="p-2.5">
      <p className="px-1 pb-2 text-[10.5px] text-ink-faint">
        {chunks.length} chunk{chunks.length === 1 ? "" : "s"} ·{" "}
        {new Set(chunks.map((chunk) => chunk.filePath)).size} file
        {new Set(chunks.map((chunk) => chunk.filePath)).size === 1 ? "" : "s"}
      </p>
      <ul className="space-y-2">
        {chunks.map((chunk, index) => (
          <ChunkCard
            key={chunk.chunkId}
            chunk={chunk}
            onOpenFile={onOpenFile}
            defaultOpen={index === 0}
          />
        ))}
      </ul>
    </div>
  );
}
