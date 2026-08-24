"use client";

import Link from "next/link";
import { ArrowLeft, PanelLeft, PanelRight, RotateCcw } from "lucide-react";
import { GithubMark } from "@/components/repo/github-mark";
import { Badge } from "@/components/ui/primitives";
import { languageColor, STATUS_TONE } from "@/lib/constants";
import { cn, formatNumber, formatRelativeTime } from "@/lib/utils";

function ToggleButton({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
        active
          ? "bg-surface-hover text-ink"
          : "text-ink-faint hover:bg-surface-hover hover:text-ink-muted",
      )}
    >
      {children}
    </button>
  );
}

export function WorkspaceHeader({
  repository,
  showExplorer,
  showContext,
  onToggleExplorer,
  onToggleContext,
  onReindex,
  reindexing,
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/40 px-4">
      <Link
        href="/dashboard"
        aria-label="Back to repositories"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>

      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: languageColor(repository.language) }}
        aria-hidden
      />

      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[14px] font-medium text-ink">{repository.fullName}</h1>
        <span className="hidden shrink-0 font-mono text-[11px] text-ink-faint sm:inline">
          {formatNumber(repository.fileCount)} files · {formatNumber(repository.chunkCount)} chunks
        </span>
      </div>

      <Badge tone={STATUS_TONE[repository.status] ?? "neutral"} className="shrink-0">
        {repository.status === "READY"
          ? `Indexed ${formatRelativeTime(repository.indexedAt)}`
          : repository.status}
      </Badge>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onReindex}
          disabled={reindexing}
          title="Re-index this repository"
          aria-label="Re-index this repository"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", reindexing && "animate-spin")} aria-hidden />
        </button>

        <a
          href={repository.url}
          target="_blank"
          rel="noreferrer"
          title="Open on GitHub"
          aria-label="Open on GitHub"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
        >
          <GithubMark className="h-3.5 w-3.5" />
        </a>

        <span className="mx-1 h-4 w-px bg-line" aria-hidden />

        <ToggleButton
          active={showExplorer}
          label="Toggle file explorer"
          onClick={onToggleExplorer}
        >
          <PanelLeft className="h-3.5 w-3.5" aria-hidden />
        </ToggleButton>
        <ToggleButton active={showContext} label="Toggle context panel" onClick={onToggleContext}>
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
        </ToggleButton>
      </div>
    </header>
  );
}
