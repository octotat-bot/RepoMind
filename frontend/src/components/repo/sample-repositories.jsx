"use client";

import { ArrowUpRight } from "lucide-react";
import { SAMPLE_REPOSITORIES } from "@/lib/constants";

/** Curated starting points — clicking one fills the import input. */
export function SampleRepositories({ onPick, disabled = false }) {
  return (
    <section aria-labelledby="sample-repositories">
      <h2
        id="sample-repositories"
        className="text-[11px] font-medium tracking-wider text-ink-faint uppercase"
      >
        Sample repositories
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SAMPLE_REPOSITORIES.map((sample) => (
          <button
            key={sample.url}
            type="button"
            disabled={disabled}
            onClick={() => onPick?.(sample.url)}
            className="group rounded-xl border border-line bg-surface px-3.5 py-3 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-45"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-[12px] text-ink">{sample.name}</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-ink-muted"
                aria-hidden
              />
            </span>
            <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-subtle">
              {sample.blurb}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
