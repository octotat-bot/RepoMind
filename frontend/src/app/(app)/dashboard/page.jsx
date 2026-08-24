"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/primitives";
import { RepoGrid } from "@/components/repo/repo-grid";
import { StatStrip } from "@/components/repo/repo-stats";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";

const EMPTY_TOTALS = { repositories: 0, files: 0, chunks: 0, lines: 0 };

export default function DashboardPage() {
  const router = useRouter();
  const { data, error, loading, refetch, setData } = useAsync(() => api.repos.list(), []);

  const repositories = data ?? [];

  useEffect(() => {
    if (error) toast.error(error.message);
  }, [error]);

  const totals = useMemo(
    () =>
      repositories.reduce(
        (accumulator, repository) => ({
          repositories: accumulator.repositories + 1,
          files: accumulator.files + (repository.fileCount ?? 0),
          chunks: accumulator.chunks + (repository.chunkCount ?? 0),
          lines: accumulator.lines + (repository.lineCount ?? 0),
        }),
        EMPTY_TOTALS,
      ),
    [repositories],
  );

  const handleRemoved = useCallback(
    (id) => setData((current) => (current ?? []).filter((repository) => repository.id !== id)),
    [setData],
  );

  const handleUpdated = useCallback(
    (next) =>
      setData((current) =>
        (current ?? []).map((repository) =>
          repository.id === next.id ? { ...repository, ...next } : repository,
        ),
      ),
    [setData],
  );

  const readyCount = repositories.filter((repository) => repository.status === "READY").length;
  const subtitle = loading
    ? "Loading your workspace…"
    : repositories.length === 0
      ? "Import a repository to start asking questions about real code."
      : `${repositories.length} ${repositories.length === 1 ? "repository" : "repositories"} · ${readyCount} ready to query`;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-10 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-gradient text-[26px] font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>
        </div>
        <Button variant="primary" onClick={() => router.push("/import")}>
          <Plus className="h-4 w-4" aria-hidden />
          Import repository
        </Button>
      </motion.header>

      <StatStrip totals={totals} loading={loading} className="mt-8" />

      <div className="mt-6">
        {error && !repositories.length ? (
          <Card>
            <EmptyState
              icon={TriangleAlert}
              title="Could not load your repositories"
              description={error.message}
              action={
                <Button variant="secondary" onClick={refetch}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Try again
                </Button>
              }
            />
          </Card>
        ) : (
          <RepoGrid
            repositories={repositories}
            loading={loading}
            onRemoved={handleRemoved}
            onUpdated={handleUpdated}
          />
        )}
      </div>
    </div>
  );
}
