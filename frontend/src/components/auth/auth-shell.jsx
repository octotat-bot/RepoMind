"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Boxes } from "lucide-react";

const HIGHLIGHTS = [
  "Local embeddings — your code never leaves your machine",
  "Answers cite exact files and line ranges",
  "Architecture and dead-code analysis from real ASTs",
];

/**
 * Split layout shared by sign-in and sign-up.
 *
 * The marketing column is hidden below `lg` so the form is never pushed below
 * the fold on a laptop or phone.
 */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh bg-canvas">
      <div className="flex flex-1 flex-col px-6 py-10 sm:px-10">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
            <Boxes className="h-4 w-4 text-canvas" aria-hidden />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">RepoMind</span>
        </Link>

        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[380px]"
          >
            <h1 className="text-gradient text-[26px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-[13px] text-ink-subtle">{footer}</div>}
          </motion.div>
        </div>
      </div>

      <aside className="relative hidden w-[46%] max-w-[620px] shrink-0 overflow-hidden border-l border-line bg-surface/40 lg:block">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_60%)]"
          aria-hidden
        />

        <div className="relative flex h-full flex-col justify-center px-14">
          <motion.blockquote
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[22px] leading-[1.45] font-medium tracking-tight text-ink">
              Ask a repository what it does — and get an answer that points at the
              lines it came from.
            </p>

            <ul className="mt-10 space-y-3.5">
              {HIGHLIGHTS.map((highlight, index) => (
                <motion.li
                  key={highlight}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45, delay: 0.3 + index * 0.08 }}
                  className="flex items-start gap-3 text-[13px] text-ink-muted"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" aria-hidden />
                  {highlight}
                </motion.li>
              ))}
            </ul>
          </motion.blockquote>
        </div>
      </aside>
    </div>
  );
}
