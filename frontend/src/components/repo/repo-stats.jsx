import { Boxes, Files, Layers, ScrollText, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import { cn, formatNumber } from "@/lib/utils";

/** One icon + number pair, sized for dense card footers. */
export function RepoStat({ icon: Icon, value, label, className }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px]", className)}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <span className="tabular-nums text-ink-muted">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function RepoStats({ repository, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <RepoStat icon={Star} value={formatNumber(repository.stars)} label="stars" />
      <RepoStat icon={Files} value={formatNumber(repository.fileCount)} label="files indexed" />
      <RepoStat icon={Layers} value={formatNumber(repository.chunkCount)} label="chunks" />
    </div>
  );
}

const AGGREGATES = [
  { key: "repositories", label: "Repositories", icon: Boxes },
  { key: "files", label: "Files indexed", icon: Files },
  { key: "chunks", label: "Chunks", icon: Layers },
  { key: "lines", label: "Lines of code", icon: ScrollText },
];

/** Workspace-wide totals across the top of the dashboard. */
export function StatStrip({ totals, loading = false, className }) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4",
        className,
      )}
    >
      {AGGREGATES.map(({ key, label, icon: Icon }) => (
        <div key={key} className="bg-surface px-5 py-4">
          <dt className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-ink-faint uppercase">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </dt>
          {loading ? (
            <Skeleton className="mt-2.5 h-7 w-16" />
          ) : (
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">
              {formatNumber(totals?.[key] ?? 0)}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
