"use client";

import { useState } from "react";
import { Crosshair, Info } from "lucide-react";
import { RepoMeta } from "@/components/workspace/repo-meta";
import { RetrievedChunks } from "@/components/workspace/retrieved-chunks";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "context", label: "Context", icon: Crosshair },
  { id: "details", label: "Details", icon: Info },
];

/** Right rail: what the last answer retrieved, and what this repository is. */
export function ContextPanel({ detail, chunks, onOpenFile }) {
  const [tab, setTab] = useState("context");

  return (
    <div className="flex h-full flex-col bg-surface/30">
      <div
        role="tablist"
        aria-label="Context panel"
        className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2"
      >
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
              tab === id
                ? "bg-surface-hover text-ink"
                : "text-ink-subtle hover:text-ink-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
            {id === "context" && chunks.length > 0 && (
              <span className="ml-0.5 rounded bg-ink px-1 font-mono text-[9.5px] font-semibold text-canvas">
                {chunks.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "context" ? (
          <RetrievedChunks chunks={chunks} onOpenFile={onOpenFile} />
        ) : (
          <RepoMeta detail={detail} />
        )}
      </div>
    </div>
  );
}
