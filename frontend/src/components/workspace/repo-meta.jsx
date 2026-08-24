"use client";

import { ExternalLink } from "lucide-react";
import { languageColor } from "@/lib/constants";
import { formatBytes, formatNumber, formatRelativeTime } from "@/lib/utils";

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="shrink-0 text-[11.5px] text-ink-subtle">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[11.5px] text-ink">
        {children}
      </span>
    </div>
  );
}

/** Repository facts plus the index that answers are drawn from. */
export function RepoMeta({ detail }) {
  const { repository, index, languages = [] } = detail;
  const totalFiles = languages.reduce((sum, entry) => sum + entry.files, 0) || 1;

  return (
    <div className="space-y-5 p-4">
      <section>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium text-ink">{repository.name}</p>
            <p className="truncate text-[12px] text-ink-subtle">{repository.owner}</p>
          </div>
          <a
            href={repository.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on GitHub"
            className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>

        {repository.description && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-subtle">
            {repository.description}
          </p>
        )}
      </section>

      <section>
        <h4 className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint">
          REPOSITORY
        </h4>
        <Row label="Language">{repository.language ?? "—"}</Row>
        <Row label="Stars">{formatNumber(repository.stars)}</Row>
        <Row label="Forks">{formatNumber(repository.forks)}</Row>
        <Row label="Branch">{repository.defaultBranch}</Row>
        <Row label="Indexed">{formatRelativeTime(repository.indexedAt)}</Row>
      </section>

      <section>
        <h4 className="mb-1.5 text-[10.5px] font-medium tracking-wide text-ink-faint">
          INDEX
        </h4>
        <Row label="Files">{formatNumber(repository.fileCount)}</Row>
        <Row label="Chunks">{formatNumber(repository.chunkCount)}</Row>
        <Row label="Lines">{formatNumber(repository.lineCount)}</Row>
        <Row label="Source size">{formatBytes(repository.totalBytes)}</Row>
        {index && (
          <>
            <Row label="Vectors">{formatNumber(index.vectorCount)}</Row>
            <Row label="Dimensions">{index.dimension}</Row>
            <Row label="Metric">{index.metric}</Row>
            <Row label="Embedding model">{index.embeddingModel}</Row>
            <Row label="Index size">{formatBytes(index.sizeBytes)}</Row>
          </>
        )}
      </section>

      {languages.length > 0 && (
        <section>
          <h4 className="mb-2 text-[10.5px] font-medium tracking-wide text-ink-faint">
            LANGUAGES
          </h4>

          <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-raised">
            {languages.slice(0, 8).map((entry) => (
              <span
                key={entry.language}
                title={`${entry.language} · ${entry.files} files`}
                style={{
                  width: `${(entry.files / totalFiles) * 100}%`,
                  background: languageColor(entry.language),
                }}
              />
            ))}
          </div>

          <ul className="mt-2.5 space-y-1">
            {languages.slice(0, 8).map((entry) => (
              <li key={entry.language} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: languageColor(entry.language) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-muted">
                  {entry.language}
                </span>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-ink-faint">
                  {Math.round((entry.files / totalFiles) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
