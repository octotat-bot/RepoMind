"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge, Card, Dot } from "@/components/ui/primitives";
import { RepoCardFailure, RepoCardProgress } from "@/components/repo/repo-card-status";
import { RepoStats } from "@/components/repo/repo-stats";
import { useIndexProgress } from "@/components/repo/use-index-progress";
import { api } from "@/lib/api";
import { STATUS_TONE, TERMINAL_STATUSES, languageColor } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";

export function RepoCard({ repository, index = 0, onRemoved, onUpdated }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const streaming = !TERMINAL_STATUSES.has(repository.status);

  const handleSettled = useCallback(
    async (settled) => {
      if (settled.status !== "READY") {
        onUpdated?.({
          ...repository,
          status: "FAILED",
          errorMessage: settled.error ?? settled.message,
        });
        return;
      }
      try {
        const { repository: fresh } = await api.repos.get(repository.id);
        onUpdated?.(fresh);
      } catch {
        // The counts stay stale, but the card must not remain stuck mid-pipeline.
        onUpdated?.({ ...repository, status: "READY", progress: 100 });
      }
    },
    [repository, onUpdated],
  );

  const { frame } = useIndexProgress(repository.id, {
    enabled: streaming,
    onSettled: handleSettled,
  });

  const status = frame?.status ?? repository.status;
  const progress = frame?.progress ?? repository.progress ?? 0;
  const ready = status === "READY";
  const failed = status === "FAILED";
  const indexing = !TERMINAL_STATUSES.has(status);

  const remove = async () => {
    setRemoving(true);
    try {
      await api.repos.remove(repository.id);
      toast.success(`Removed ${repository.fullName}`);
      setConfirming(false);
      onRemoved?.(repository.id);
    } catch (error) {
      toast.error(error.message);
      // Only reset on failure — a successful delete unmounts this card.
      setRemoving(false);
    }
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await api.repos.reindex(repository.id);
      toast.success(`Re-indexing ${repository.fullName}`);
      onUpdated?.({
        ...repository,
        status: "QUEUED",
        progress: 0,
        statusMessage: "Queued",
        errorMessage: null,
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 11) * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card interactive className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-ink">
              <span className="text-ink-subtle">{repository.owner}/</span>
              {repository.name}
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">
              {repository.indexedAt
                ? `Indexed ${formatRelativeTime(repository.indexedAt)}`
                : "Not indexed yet"}
            </p>
          </div>
          <Badge tone={STATUS_TONE[status] ?? "neutral"} className="shrink-0">
            <Dot tone={STATUS_TONE[status] ?? "neutral"} pulse={indexing} />
            {status.toLowerCase()}
          </Badge>
        </div>

        <p className="line-clamp-2 min-h-[36px] text-[13px] leading-relaxed text-ink-muted">
          {repository.description || "No description provided."}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {repository.language && (
            <Badge>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: languageColor(repository.language) }}
                aria-hidden
              />
              {repository.language}
            </Badge>
          )}
          <RepoStats repository={repository} />
        </div>

        {indexing && (
          <RepoCardProgress
            status={status}
            progress={progress}
            message={frame?.message ?? repository.statusMessage}
          />
        )}

        {failed && (
          <RepoCardFailure
            message={frame?.error ?? repository.errorMessage}
            onRetry={retry}
            retrying={retrying}
          />
        )}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={!ready}
            onClick={() => router.push(`/workspace/${repository.id}`)}
            className="flex-1"
          >
            Open workspace
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${repository.fullName}`}
            onClick={() => setConfirming(true)}
            className="h-8 w-8 shrink-0 hover:text-critical"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        onClose={() => !removing && setConfirming(false)}
        onConfirm={remove}
        title={`Delete ${repository.fullName}?`}
        description="The clone, its embeddings and every conversation about it are removed. This cannot be undone."
        confirmLabel="Delete repository"
        loading={removing}
        destructive
      />
    </motion.div>
  );
}
