"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/primitives";
import { INDEX_STAGES } from "@/lib/constants";

function stageLabel(status) {
  return INDEX_STAGES.find((stage) => stage.status === status)?.label ?? "Working";
}

/** Live pipeline readout shown while a repository is still being indexed. */
export function RepoCardProgress({ status, progress, message }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised/60 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12px] font-medium text-ink">{stageLabel(status)}</span>
        <span className="text-[12px] tabular-nums text-ink-muted">
          {Math.round(progress)}%
        </span>
      </div>
      <Progress value={progress} className="mt-2.5" />
      {message && (
        <p className="mt-2 truncate text-[11px] text-ink-subtle" title={message}>
          {message}
        </p>
      )}
    </div>
  );
}

export function RepoCardFailure({ message, onRetry, retrying = false }) {
  return (
    <div className="rounded-xl border border-critical/25 bg-critical/5 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" aria-hidden />
        <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-critical">
          {message || "Indexing failed."}
        </p>
      </div>
      <Button
        variant="danger"
        size="sm"
        loading={retrying}
        onClick={onRetry}
        className="mt-2.5 w-full"
      >
        {!retrying && <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
        Retry
      </Button>
    </div>
  );
}
