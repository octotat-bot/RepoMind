"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Check, ChevronsUpDown } from "lucide-react";
import { languageColor } from "@/lib/constants";
import { cn, formatNumber } from "@/lib/utils";

/** Dropdown over the caller's READY repositories. */
export function RepoSelector({ repositories = [], selectedId, onSelect, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selected = repositories.find((repo) => repo.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled || repositories.length === 0}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 min-w-[220px] items-center gap-2.5 rounded-xl border border-line",
          "bg-surface px-3 text-left transition-colors",
          "hover:border-line-strong hover:bg-surface-hover",
          "disabled:pointer-events-none disabled:opacity-45",
          open && "border-line-strong bg-surface-hover",
        )}
      >
        {selected ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: languageColor(selected.language) }}
            aria-hidden
          />
        ) : (
          <Boxes className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
          {selected?.fullName ?? "No repository"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "absolute right-0 z-40 mt-2 max-h-[320px] w-[320px] overflow-y-auto",
              "rounded-xl border border-line bg-surface-raised p-1 shadow-2xl",
            )}
          >
            {repositories.map((repo) => {
              const active = repo.id === selectedId;
              return (
                <li key={repo.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onSelect?.(repo.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                      active ? "bg-surface-hover" : "hover:bg-surface-hover/60",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: languageColor(repo.language) }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{repo.fullName}</span>
                      <span className="block text-[11px] text-ink-faint">
                        {formatNumber(repo.fileCount)} files · {formatNumber(repo.chunkCount)} chunks
                      </span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-ink" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
