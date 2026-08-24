"use client";

import { motion } from "framer-motion";
import { FileCode, Folder, Quote, Radar, Send } from "lucide-react";
import { Badge, Kbd } from "@/components/ui/primitives";
import { EASE } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const TREE = [
  { name: "src", type: "dir" },
  { name: "requests", type: "dir", depth: 1 },
  { name: "auth.py", depth: 2, active: true },
  { name: "sessions.py", depth: 2 },
  { name: "adapters.py", depth: 2 },
  { name: "models.py", depth: 2 },
  { name: "tests", type: "dir" },
  { name: "test_auth.py", depth: 1 },
];

const CITATIONS = ["src/requests/auth.py:1-31", "src/requests/sessions.py:462-489"];

export function ProductPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
      className="relative mx-auto mt-16 w-full max-w-5xl sm:mt-20"
    >
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-8 bottom-8 rounded-[48px] bg-white/[0.04] blur-3xl"
      />

      <div className="panel relative overflow-hidden bg-surface/85 shadow-[0_48px_120px_-48px_rgba(0,0,0,0.95)] backdrop-blur-sm">
        <Chrome />
        <div className="grid grid-cols-1 sm:grid-cols-[196px_1fr]">
          <FileRail />
          <Conversation />
        </div>
      </div>
    </motion.div>
  );
}

function Chrome() {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-line bg-surface-raised/60 px-4">
      <span className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        ))}
      </span>
      <span className="truncate font-mono text-[12px] text-ink-muted">psf/requests</span>
      <Badge tone="positive">Ready</Badge>
      <span className="ml-auto hidden font-mono text-[11px] text-ink-faint sm:block">
        312 files · 4,182 chunks
      </span>
    </div>
  );
}

function FileRail() {
  return (
    <div className="hidden border-r border-line bg-canvas/40 p-3 sm:block">
      <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        Files
      </p>
      {TREE.map((node) => (
        <div
          key={`${node.depth ?? 0}-${node.name}`}
          style={{ paddingLeft: `${8 + (node.depth ?? 0) * 12}px` }}
          className={cn(
            "flex items-center gap-2 rounded-md py-1.5 pr-2 font-mono text-[11px]",
            node.active ? "bg-surface-hover text-ink" : "text-ink-subtle",
          )}
        >
          {node.type === "dir" ? (
            <Folder className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
          ) : (
            <FileCode className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden />
          )}
          <span className="truncate">{node.name}</span>
        </div>
      ))}
    </div>
  );
}

function Conversation() {
  return (
    <div className="flex min-h-[352px] flex-col p-4 sm:p-6">
      <Step delay={0.75} className="flex justify-end">
        <p className="max-w-[86%] rounded-2xl rounded-br-md border border-line bg-surface-raised px-4 py-2.5 text-[13px] text-ink">
          Where is authentication handled in this repo?
        </p>
      </Step>

      <Step delay={1.05} className="mt-5 flex items-center gap-2 text-[11px] text-ink-faint">
        <Radar className="h-3.5 w-3.5" aria-hidden />
        Retrieved 8 chunks across 3 files in 240ms
      </Step>

      <Step delay={1.25} className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-muted">
        <p>
          Authentication lives in its own module rather than in the request path.{" "}
          <Code>HTTPBasicAuth</Code> builds the <Code>Authorization</Code> header from a
          username and password pair, then <Code>Session.prepare_request</Code> merges it into
          every outgoing request.
        </p>
        <p>
          Digest auth is handled by <Code>HTTPDigestAuth</Code>, which hooks the response
          lifecycle to retry with a computed challenge
          <span
            className="ml-1 inline-block h-3.5 w-[2px] translate-y-[2px] animate-caret bg-ink"
            aria-hidden
          />
        </p>
      </Step>

      <Step delay={1.6} className="mt-5 flex flex-wrap items-center gap-2">
        <Quote className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
        {CITATIONS.map((citation) => (
          <span
            key={citation}
            className="rounded-md border border-line bg-surface-raised px-2 py-1 font-mono text-[11px] text-ink-muted"
          >
            {citation}
          </span>
        ))}
      </Step>

      <Step delay={1.85} className="mt-auto pt-6">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas/60 px-3.5 py-3">
          <span className="flex-1 truncate text-[13px] text-ink-faint">
            Ask about this repository…
          </span>
          <Kbd>⏎</Kbd>
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink"
            aria-hidden
          >
            <Send className="h-3.5 w-3.5 text-canvas" />
          </span>
        </div>
      </Step>
    </div>
  );
}

function Step({ delay, className, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Code({ children }) {
  return (
    <code className="rounded border border-line bg-surface-raised px-1.5 py-0.5 font-mono text-[12px] text-ink">
      {children}
    </code>
  );
}
