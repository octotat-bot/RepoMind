"use client";

import { useRouter } from "next/navigation";
import { Boxes, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { RepoCard } from "@/components/repo/repo-card";

const GRID = "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

function RepoCardSkeleton() {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-8 w-full" />
    </Card>
  );
}

export function RepoGrid({
  repositories = [],
  loading = false,
  skeletonCount = 6,
  onRemoved,
  onUpdated,
}) {
  const router = useRouter();

  if (loading) {
    return (
      <div className={GRID}>
        {Array.from({ length: skeletonCount }, (_, position) => (
          <RepoCardSkeleton key={position} />
        ))}
      </div>
    );
  }

  if (!repositories.length) {
    return (
      <Card className="border-dashed">
        <EmptyState
          icon={Boxes}
          title="No repositories yet"
          description="Import a GitHub repository and RepoMind will clone, parse and embed it so you can ask questions about the real source."
          action={
            <Button variant="primary" onClick={() => router.push("/import")}>
              <Plus className="h-4 w-4" aria-hidden />
              Import your first repository
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className={GRID}>
      {repositories.map((repository, position) => (
        <RepoCard
          key={repository.id}
          repository={repository}
          index={position}
          onRemoved={onRemoved}
          onUpdated={onUpdated}
        />
      ))}
    </div>
  );
}
