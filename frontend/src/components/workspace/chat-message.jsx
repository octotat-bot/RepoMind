"use client";

import { useState } from "react";
import { Brain, ChevronDown, FileCode2, Sparkles } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { CitationChip, ConfidenceMeter } from "@/components/workspace/citation-chip";
import { CopyButton } from "@/components/workspace/copy-button";
import { cn, formatDuration, splitPath } from "@/lib/utils";

function Avatar({ role }) {
  const isUser = role === "USER";
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[10px] font-semibold",
        isUser
          ? "border-line bg-surface-raised text-ink-muted"
          : "border-transparent bg-ink text-canvas",
      )}
      aria-hidden
    >
      {isUser ? "You" : <Sparkles className="h-3 w-3" />}
    </span>
  );
}

function Reasoning({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface-raised/40">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-hover/50"
      >
        <Brain className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="flex-1 text-[11.5px] text-ink-subtle">How this answer was found</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <p className="border-t border-line px-3 py-2.5 text-[12px] leading-relaxed text-ink-subtle">
          {text}
        </p>
      )}
    </div>
  );
}

export function ChatMessage({ message, onOpenFile }) {
  const isUser = message.role === "USER";

  if (isUser) {
    return (
      <article className="flex justify-end gap-3">
        <div className="max-w-[80%] rounded-2xl rounded-br-md border border-line bg-surface-raised px-3.5 py-2.5">
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">
            {message.content}
          </p>
        </div>
        <Avatar role="USER" />
      </article>
    );
  }

  const citations = message.citations ?? [];
  const relatedFiles = message.relatedFiles ?? [];

  return (
    <article className="flex gap-3">
      <Avatar role="ASSISTANT" />

      <div className="min-w-0 flex-1">
        <MarkdownRenderer content={message.content} />

        {citations.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10.5px] font-medium tracking-wide text-ink-faint">
              CITATIONS
            </p>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((citation) => (
                <CitationChip
                  key={`${citation.chunkId}-${citation.number}`}
                  citation={citation}
                  onOpen={onOpenFile}
                />
              ))}
            </div>
          </div>
        )}

        {relatedFiles.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[10.5px] font-medium tracking-wide text-ink-faint">
              RELATED FILES
            </p>
            <div className="flex flex-wrap gap-1.5">
              {relatedFiles.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => onOpenFile?.({ filePath: path })}
                  title={path}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-subtle transition-colors hover:border-line-strong hover:text-ink"
                >
                  <FileCode2 className="h-3 w-3 shrink-0" aria-hidden />
                  {splitPath(path).name}
                </button>
              ))}
            </div>
          </div>
        )}

        {message.reasoning && <Reasoning text={message.reasoning} />}

        <div className="mt-3 flex items-center gap-3">
          {typeof message.confidence === "number" && (
            <ConfidenceMeter value={message.confidence} />
          )}
          {message.latencyMs > 0 && (
            <span className="text-[11px] text-ink-faint">
              {formatDuration(message.latencyMs)}
            </span>
          )}
          <CopyButton value={message.content} label="Copy answer" className="ml-auto" />
        </div>
      </div>
    </article>
  );
}

/** The answer being written right now — same layout, minus the finished metadata. */
export function StreamingMessage({ content }) {
  return (
    <article className="flex gap-3">
      <Avatar role="ASSISTANT" />
      <div className="min-w-0 flex-1">
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-ink-subtle">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-subtle"
                  style={{ animationDelay: `${index * 140}ms` }}
                />
              ))}
            </span>
            Searching the index…
          </p>
        )}
        {content && (
          <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-caret bg-ink" aria-hidden />
        )}
      </div>
    </article>
  );
}
