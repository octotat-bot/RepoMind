"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Boxes, LayoutGrid, Plus, Search, Settings } from "lucide-react";
import { Kbd } from "@/components/ui/primitives";
import { useKeyboardShortcut, useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const STATIC_ACTIONS = [
  { id: "dashboard", label: "Go to Repositories", icon: LayoutGrid, href: "/dashboard" },
  { id: "import", label: "Import a repository", icon: Plus, href: "/import" },
  { id: "search", label: "Semantic search", icon: Search, href: "/search" },
  { id: "settings", label: "Open settings", icon: Settings, href: "/settings" },
];

export function CommandPalette({ repositories = [] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const router = useRouter();
  const mounted = useMounted();

  useKeyboardShortcut("k", () => setOpen((value) => !value), {
    meta: true,
    allowInInput: true,
  });

  const actions = useMemo(() => {
    const repoActions = repositories
      .filter((repo) => repo.status === "READY")
      .map((repo) => ({
        id: `repo-${repo.id}`,
        label: repo.fullName,
        hint: "Open workspace",
        icon: Boxes,
        href: `/workspace/${repo.id}`,
      }));

    const all = [...STATIC_ACTIONS, ...repoActions];
    const term = query.trim().toLowerCase();
    if (!term) return all;
    return all.filter((action) => action.label.toLowerCase().includes(term));
  }, [query, repositories]);

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const run = (action) => {
    setOpen(false);
    router.push(action.href);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % Math.max(actions.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index - 1 + actions.length) % Math.max(actions.length, 1));
    } else if (event.key === "Enter" && actions[highlighted]) {
      event.preventDefault();
      run(actions[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[14vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="glass relative z-10 w-full max-w-[560px] overflow-hidden rounded-2xl shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search repositories and actions…"
                aria-label="Command palette"
                className="h-13 flex-1 bg-transparent py-4 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
              />
              <Kbd>ESC</Kbd>
            </div>

            <div className="max-h-[340px] overflow-y-auto p-2">
              {actions.length === 0 ? (
                <p className="px-3 py-8 text-center text-[13px] text-ink-faint">
                  No matches for “{query}”
                </p>
              ) : (
                actions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => run(action)}
                      onMouseEnter={() => setHighlighted(index)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        index === highlighted ? "bg-surface-hover" : "hover:bg-surface-hover/60",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
                      <span className="flex-1 truncate text-[13px] text-ink">{action.label}</span>
                      {action.hint && (
                        <span className="text-[11px] text-ink-faint">{action.hint}</span>
                      )}
                      {index === highlighted && (
                        <ArrowRight className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
