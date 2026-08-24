"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Check, RotateCcw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Dot, Progress, Spinner } from "@/components/ui/primitives";
import { useIndexProgress } from "@/components/repo/use-index-progress";
import { INDEX_STAGES, STATUS_TONE, TERMINAL_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

function StageRow({ stage, state, message, detail, isLast }) {
  const complete = state === "complete";
  const active = state === "active";
  const failed = state === "failed";

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-300",
            complete && "border-ink/25 bg-ink text-canvas",
            active && "border-white/25 bg-surface-raised",
            failed && "border-critical/40 bg-critical/10 text-critical",
            !complete && !active && !failed && "border-line bg-surface",
          )}
        >
          {complete && <Check className="h-3.5 w-3.5" aria-hidden />}
          {active && <Spinner className="h-3 w-3 border-[1.5px]" />}
          {failed && <X className="h-3.5 w-3.5" aria-hidden />}
        </span>
        {!isLast && (
          <span
            className={cn(
              "my-1 w-px flex-1 transition-colors duration-300",
              complete ? "bg-ink/25" : "bg-line",
            )}
          />
        )}
      </div>

      <div className={cn("min-w-0 flex-1", isLast ? "pb-0.5" : "pb-5")}>
        <p
          className={cn(
            "text-[13px] font-medium transition-colors duration-300",
            active && "text-ink",
            complete && "text-ink-muted",
            failed && "text-critical",
            !complete && !active && !failed && "text-ink-faint",
          )}
        >
          {stage.label}
        </p>
        {active && message && (
          <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">{message}</p>
        )}
        {active && detail && (
          <p className="mt-1 truncate font-mono text-[11px] text-ink-faint" title={detail}>
            {detail}
          </p>
        )}
      </div>
    </li>
  );
}

export function IndexingProgress({ repository, onReset }) {
  const router = useRouter();
  const [reached, setReached] = useState(0);

  const { frame, error: streamError } = useIndexProgress(repository.id, {
    enabled: !TERMINAL_STATUSES.has(repository.status),
  });

  const status = frame?.status ?? repository.status;
  const progress = frame?.progress ?? repository.progress ?? 0;
  const failed = status === "FAILED";
  const ready = status === "READY";

  // FAILED is not a pipeline stage, so remember the last real one to mark it.
  useEffect(() => {
    const next = INDEX_STAGES.findIndex((stage) => stage.status === status);
    if (next >= 0) setReached(next);
  }, [status]);

  const stageState = (position) => {
    if (failed) return position === reached ? "failed" : position < reached ? "complete" : "pending";
    if (position < reached) return "complete";
    if (position > reached) return "pending";
    return ready ? "complete" : "active";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">
              <span className="text-ink-subtle">{repository.owner}/</span>
              {repository.name}
            </p>
            <p className="mt-1 text-[12px] text-ink-faint">
              {ready
                ? "Indexed and ready to explore"
                : failed
                  ? "Indexing stopped"
                  : "Indexing in progress — you can leave this page"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[status] ?? "neutral"}>
              <Dot tone={STATUS_TONE[status] ?? "neutral"} pulse={!TERMINAL_STATUSES.has(status)} />
              {status.toLowerCase()}
            </Badge>
            <span className="text-[15px] font-medium tabular-nums text-ink">
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        <Progress value={progress} tone={failed ? "critical" : "default"} className="mt-5" />

        <ol className="mt-6">
          {INDEX_STAGES.map((stage, position) => (
            <StageRow
              key={stage.status}
              stage={stage}
              state={stageState(position)}
              message={frame?.message ?? repository.statusMessage}
              detail={frame?.detail}
              isLast={position === INDEX_STAGES.length - 1}
            />
          ))}
        </ol>

        {streamError && !TERMINAL_STATUSES.has(status) && (
          <p className="mt-4 text-[12px] text-caution">
            Live updates disconnected ({streamError.message}). Indexing continues on the server —
            reload to catch up.
          </p>
        )}
      </Card>

      {ready && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-positive/25 bg-positive/5 p-5">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink">
              {repository.fullName} is ready
            </p>
            <p className="mt-1 text-[12px] text-ink-subtle">
              Ask questions and get answers cited to real files and lines.
            </p>
          </div>
          <Button variant="primary" onClick={() => router.push(`/workspace/${repository.id}`)}>
            Open workspace
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Button>
        </Card>
      )}

      {failed && (
        <Card className="border-critical/25 bg-critical/5 p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-critical">
              {frame?.error ?? repository.errorMessage ?? "Indexing failed."}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onReset} className="mt-4">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
        </Card>
      )}
    </motion.div>
  );
}
