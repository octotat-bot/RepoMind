"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAsync } from "@/lib/hooks";
import { cn, splitPath } from "@/lib/utils";

const KIND_LABELS = {
  UNUSED_EXPORT: "Unused export",
  UNREFERENCED_FILE: "Unreferenced file",
  DUPLICATE_UTILITY: "Duplicate utility",
  UNUSED_IMPORT: "Unused import",
};

const SEVERITY_TONE = { HIGH: "critical", MEDIUM: "caution", LOW: "neutral" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "UNUSED_EXPORT", label: "Unused exports" },
  { id: "UNREFERENCED_FILE", label: "Unreferenced files" },
  { id: "DUPLICATE_UTILITY", label: "Duplicates" },
  { id: "UNUSED_IMPORT", label: "Unused imports" },
];

function Finding({ finding, onOpenFile }) {
  const { name } = splitPath(finding.filePath);

  return (
    <button
      type="button"
      onClick={() =>
        onOpenFile?.({
          filePath: finding.filePath,
          startLine: finding.line,
          endLine: finding.line,
        })
      }
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover/50"
    >
      <Badge tone={SEVERITY_TONE[finding.severity] ?? "neutral"} className="mt-0.5 shrink-0">
        {KIND_LABELS[finding.kind] ?? finding.kind}
      </Badge>

      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-relaxed text-ink-muted">{finding.message}</p>
        <p className="mt-1 truncate font-mono text-[10.5px] text-ink-faint">
          {finding.filePath}
          {finding.line > 1 && `:${finding.line}`}
        </p>
      </div>

      <span className="shrink-0 font-mono text-[10.5px] text-ink-faint">{name}</span>
    </button>
  );
}

export function DeadCodePanel({ repositoryId, onOpenFile }) {
  const [filter, setFilter] = useState("all");
  const { data, error, loading } = useAsync(
    () => api.repos.deadCode(repositoryId),
    [repositoryId],
  );

  const findings = useMemo(() => {
    const all = data?.findings ?? [];
    return filter === "all" ? all : all.filter((finding) => finding.kind === filter);
  }, [data, filter]);

  if (loading) {
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not analyse this repository"
        description={error.message}
        className="py-20"
      />
    );
  }

  const { summary } = data;

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((entry) => {
          const count =
            entry.id === "all"
              ? summary.total
              : (data.findings ?? []).filter((finding) => finding.kind === entry.id).length;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-[12px] transition-colors",
                filter === entry.id
                  ? "border-line-strong bg-surface-hover text-ink"
                  : "border-line bg-surface text-ink-subtle hover:text-ink-muted",
              )}
            >
              {entry.label}
              <span className="ml-1.5 font-mono text-[10.5px] text-ink-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {summary.total === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Nothing obviously dead"
            description={`Analysed ${summary.modulesAnalysed} modules and found no unused exports, unreferenced files or duplicate utilities.`}
          />
        </Card>
      ) : findings.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="No findings in this category"
            description="Try another filter to see the rest of the analysis."
            className="py-12"
          />
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-line">
            {findings.map((finding, index) => (
              <Finding
                key={`${finding.kind}-${finding.filePath}-${finding.line}-${finding.symbol ?? ""}-${index}`}
                finding={finding}
                onOpenFile={onOpenFile}
              />
            ))}
          </Card>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Static analysis cannot see dynamic imports, dependency injection or framework
            conventions, so treat these as leads rather than facts. Entry points and test
            files are already excluded.
          </p>
        </>
      )}
    </div>
  );
}
