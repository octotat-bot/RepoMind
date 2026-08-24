"use client";

import { useRouter } from "next/navigation";
import { FileSearch, Plus, ScanSearch, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";

const SKELETON_LINE_WIDTHS = ["w-[88%]", "w-[74%]", "w-[61%]", "w-[47%]"];

export const EXAMPLE_QUERIES = [
  "database connection",
  "authentication middleware",
  "error handling",
  "where are routes registered",
  "password hashing",
  "background job queue",
];

/** Pre-search state: explains the retrieval model and offers starter queries. */
export function SearchIntro({ onPick, disabled = false }) {
  return (
    <Card className="px-6 py-12">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface">
          <ScanSearch className="h-5 w-5 text-ink-subtle" aria-hidden />
        </div>
        <h3 className="text-[15px] font-medium text-ink">Search by meaning, not keywords</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">
          Every chunk of this repository is embedded locally, so describing behaviour works
          better than guessing identifiers.
        </p>

        <div className="mt-7">
          <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] tracking-wide text-ink-faint">
            <Sparkles className="h-3 w-3" aria-hidden />
            TRY ONE OF THESE
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUERIES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={disabled}
                onClick={() => onPick?.(example)}
                className="rounded-full border border-line bg-surface-raised px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-45"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function SearchSkeletons({ count = 4 }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-3 w-5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="mt-4 space-y-1.5">
            {SKELETON_LINE_WIDTHS.map((width) => (
              <Skeleton key={width} className={`h-2.5 ${width}`} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function NoResults({ query }) {
  return (
    <Card>
      <EmptyState
        icon={FileSearch}
        title="Nothing matched that"
        description={`No chunk in this repository was close enough to “${query}”. Try describing the behaviour differently, or widen the wording.`}
      />
    </Card>
  );
}

export function NoReadyRepositories() {
  const router = useRouter();

  return (
    <Card>
      <EmptyState
        icon={Plus}
        title="No indexed repository yet"
        description="Search runs against a local vector index, so a repository has to finish importing before it can be queried."
        action={
          <Button variant="primary" size="md" onClick={() => router.push("/import")}>
            Import a repository
          </Button>
        }
      />
    </Card>
  );
}
