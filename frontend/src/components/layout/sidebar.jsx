"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Boxes, LayoutGrid, Plus, Search, Settings } from "lucide-react";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Repositories", icon: LayoutGrid },
  { href: "/import", label: "Import", icon: Plus },
  { href: "/search", label: "Search", icon: Search },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ footer }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-line bg-surface/40">
      <Link
        href="/dashboard"
        className="flex h-16 items-center gap-2.5 px-5 transition-opacity hover:opacity-80"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
          <Boxes className="h-4 w-4 text-canvas" aria-hidden />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">RepoMind</span>
      </Link>

      <nav className="flex-1 space-y-0.5 px-3 py-2" aria-label="Main">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors",
                active ? "text-ink" : "text-ink-subtle hover:text-ink-muted hover:bg-surface-hover",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg border border-line bg-surface-raised"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative z-10 h-4 w-4" aria-hidden />
              <span className="relative z-10 font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 pb-3">
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-[11px] text-ink-faint">Command palette</span>
          <span className="flex gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </div>
      </div>

      {footer && <div className="border-t border-line p-3">{footer}</div>}
    </aside>
  );
}
