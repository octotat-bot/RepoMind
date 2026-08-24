"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Layers } from "lucide-react";
import { CodeSnippet } from "@/components/search/code-snippet";
import { languageColor } from "@/lib/constants";
import { cn, splitPath } from "@/lib/utils";

export function SearchResult({ result, index, onOpen }) {
  const { directory, name } = splitPath(result.filePath);
  const similarity = Math.round(Math.max(0, Math.min(1, result.similarity ?? result.score ?? 0)) * 100);
  const extraMatches = (result.matches ?? 1) - 1;

  const activate = () => onOpen?.(result);
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "panel group cursor-pointer overflow-hidden text-left",
        "transition-colors duration-200 hover:border-line-strong hover:bg-surface-raised",
      )}
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className="mt-0.5 font-mono text-[11px] tabular-nums text-ink-faint">
          {String(result.rank ?? index + 1).padStart(2, "0")}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px]">
            {directory && <span className="text-ink-faint">{directory}/</span>}
            <span className="font-medium text-ink">{name}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-ink-subtle">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: languageColor(result.language) }}
                aria-hidden
              />
              {result.language}
            </span>
            <span className="text-ink-faint">
              L{result.startLine}–{result.endLine}
            </span>
            {extraMatches > 0 && (
              <span className="inline-flex items-center gap-1 text-ink-subtle">
                <Layers className="h-3 w-3" aria-hidden />
                {extraMatches} more {extraMatches === 1 ? "match" : "matches"} in this file
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="w-[92px]">
            <div className="flex items-baseline justify-end gap-1">
              <span className="font-mono text-[13px] tabular-nums text-ink">{similarity}</span>
              <span className="text-[10px] text-ink-faint">% match</span>
            </div>
            <div
              className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover"
              role="img"
              aria-label={`${similarity} percent similarity`}
            >
              <div className="h-full rounded-full bg-ink/80" style={{ width: `${similarity}%` }} />
            </div>
          </div>
          <ArrowUpRight
            className="h-4 w-4 text-ink-faint transition-colors group-hover:text-ink"
            aria-hidden
          />
        </div>
      </div>

      {result.symbols?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-3 pl-10">
          {result.symbols.slice(0, 8).map((symbol) => (
            <span
              key={symbol}
              className="rounded-md border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
            >
              {symbol}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-line bg-canvas/40">
        <CodeSnippet
          code={result.snippet ?? ""}
          language={result.language}
          startLine={result.startLine ?? 1}
        />
      </div>

      {result.otherMatches?.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="text-[11px] text-ink-faint">Also matched</span>
          {result.otherMatches.map((match) => (
            <span
              key={match.chunkId}
              className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle"
            >
              L{match.startLine}–{match.endLine}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
