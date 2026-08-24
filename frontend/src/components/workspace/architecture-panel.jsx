"use client";

import { Network, RotateCw, TriangleAlert } from "lucide-react";
import { ArchitectureGraph } from "@/components/workspace/architecture-graph";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { languageColor } from "@/lib/constants";
import { useAsync } from "@/lib/hooks";
import { formatNumber } from "@/lib/utils";

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
      <p className="font-mono text-[18px] tabular-nums text-ink">{formatNumber(value)}</p>
      <p className="mt-0.5 text-[11px] text-ink-subtle">{label}</p>
    </div>
  );
}

export function ArchitecturePanel({ repositoryId, onOpenFile }) {
  const { data, error, loading } = useAsync(
    () => api.repos.architecture(repositoryId),
    [repositoryId],
  );

  if (loading) {
    return (
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[68px]" />
          ))}
        </div>
        <Skeleton className="h-[480px]" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Could not generate the architecture view"
        description={error.message}
        className="py-20"
      />
    );
  }

  const { stats, techStack = [], hierarchy = [], entryPoints = [], relationships = [] } = data;
  const cycles = data.graph?.cycles ?? [];

  return (
    <div className="space-y-6 p-5">
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Modules" value={stats.modules} />
          <Stat label="Files" value={stats.files} />
          <Stat label="Dependencies" value={stats.edges} />
          <Stat label="External packages" value={stats.externalPackages} />
        </div>
      </section>

      {techStack.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            TECH STACK
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {techStack.map((item) => (
              <Badge key={item} tone="neutral">
                {item}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-subtle">
          <Network className="h-3.5 w-3.5" aria-hidden />
          DEPENDENCY GRAPH
        </h3>
        <ArchitectureGraph graph={data.graph} onOpenFile={onOpenFile} />
      </section>

      {cycles.length > 0 && (
        <section>
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            <RotateCw className="h-3.5 w-3.5" aria-hidden />
            CIRCULAR IMPORTS
            <Badge tone="caution">{cycles.length}</Badge>
          </h3>
          <Card className="divide-y divide-line">
            {cycles.map((cycle) => (
              <div key={cycle.join()} className="px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  {cycle.map((path, position) => (
                    <span key={path} className="inline-flex items-center gap-1.5">
                      {position > 0 && <span className="text-ink-faint">→</span>}
                      <button
                        type="button"
                        onClick={() => onOpenFile?.({ filePath: path })}
                        title={path}
                        className="font-mono text-[11.5px] text-ink-muted underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
                      >
                        {path.split("/").pop()}
                      </button>
                    </span>
                  ))}
                  <span className="text-ink-faint">↺</span>
                </div>
              </div>
            ))}
          </Card>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            These modules import each other, directly or through a chain. Not always a
            defect — Python resolves many of them at runtime — but they make modules
            harder to test and reuse in isolation.
          </p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            FOLDER HIERARCHY
          </h3>
          <Card className="divide-y divide-line">
            {hierarchy.slice(0, 12).map((folder) => (
              <div key={folder.path} className="flex items-center gap-2.5 px-3.5 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: languageColor(folder.language) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-muted">
                  {folder.path}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                  {folder.files}
                </span>
              </div>
            ))}
          </Card>
        </section>

        <section>
          <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            MODULE RELATIONSHIPS
          </h3>
          <Card className="divide-y divide-line">
            {relationships.length === 0 ? (
              <p className="px-3.5 py-4 text-[12px] text-ink-subtle">
                Every module resolves within its own directory.
              </p>
            ) : (
              relationships.slice(0, 12).map((relation) => (
                <div
                  key={`${relation.source}-${relation.target}`}
                  className="flex items-center gap-2 px-3.5 py-2"
                >
                  <span className="truncate font-mono text-[12px] text-ink-muted">
                    {relation.source}
                  </span>
                  <span className="shrink-0 text-ink-faint" aria-label="depends on">
                    →
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-muted">
                    {relation.target}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                    {relation.weight}
                  </span>
                </div>
              ))
            )}
          </Card>
        </section>
      </div>

      {entryPoints.length > 0 && (
        <section>
          <h3 className="mb-2.5 text-[11px] font-medium tracking-wide text-ink-subtle">
            LIKELY ENTRY POINTS
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {entryPoints.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => onOpenFile?.({ filePath: path })}
                className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-[11px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink"
              >
                {path}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
