"use client";

import { ArrowUpRight } from "lucide-react";
import { CopyButton } from "@/components/workspace/copy-button";
import { cn, splitPath } from "@/lib/utils";

/** Clickable reference to an exact file and line range. */
export function CitationChip({ citation, onOpen, showCopy = true }) {
  const { name } = splitPath(citation.filePath);
  const location = `${citation.filePath}:${citation.startLine}-${citation.endLine}`;

  return (
    <span
      className={cn(
        "group inline-flex items-center gap-1 rounded-lg border border-line bg-surface-raised",
        "pl-1.5 pr-1 py-0.5 transition-colors hover:border-line-strong hover:bg-surface-hover",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen?.(citation)}
        title={`Open ${location}`}
        className="inline-flex items-center gap-1.5"
      >
        <span className="flex h-4 min-w-4 items-center justify-center rounded bg-ink px-1 font-mono text-[9.5px] font-semibold text-canvas">
          {citation.number}
        </span>
        <span className="max-w-[180px] truncate font-mono text-[11px] text-ink-muted group-hover:text-ink">
          {name}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          L{citation.startLine}–{citation.endLine}
        </span>
        <ArrowUpRight
          className="h-3 w-3 text-ink-faint transition-colors group-hover:text-ink"
          aria-hidden
        />
      </button>
      {showCopy && (
        <CopyButton value={location} label="Copy citation" className="h-4 w-4" iconClassName="h-3 w-3" />
      )}
    </span>
  );
}

const CONFIDENCE_BANDS = [
  { min: 0.7, label: "High confidence", tone: "text-positive", bar: "bg-positive" },
  { min: 0.45, label: "Moderate confidence", tone: "text-caution", bar: "bg-caution" },
  { min: 0, label: "Low confidence", tone: "text-critical", bar: "bg-critical" },
];

/** Derived from retrieval strength and citation behaviour, not self-reported. */
export function ConfidenceMeter({ value = 0 }) {
  const band = CONFIDENCE_BANDS.find((entry) => value >= entry.min) ?? CONFIDENCE_BANDS.at(-1);
  const percent = Math.round(value * 100);

  return (
    <span className="inline-flex items-center gap-2" title="Derived from retrieval scores and how the answer cited its context">
      <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-hover">
        <span
          className={cn("block h-full rounded-full transition-all duration-500", band.bar)}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className={cn("text-[11px]", band.tone)}>
        {band.label} · {percent}%
      </span>
    </span>
  );
}
