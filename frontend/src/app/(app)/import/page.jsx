"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Braces, Cpu, Database, GitBranch, Layers } from "lucide-react";
import { toast } from "sonner";
import { ImportForm } from "@/components/repo/import-form";
import { IndexingProgress } from "@/components/repo/indexing-progress";
import { api } from "@/lib/api";

const PIPELINE = [
  {
    icon: GitBranch,
    title: "Clone",
    body: "The default branch is cloned into an isolated workspace on the server.",
  },
  {
    icon: Braces,
    title: "Parse",
    body: "Every supported file is walked to map functions, classes and imports.",
  },
  {
    icon: Layers,
    title: "Chunk",
    body: "Code is split along symbol boundaries so citations point at whole units.",
  },
  {
    icon: Cpu,
    title: "Embed",
    body: "Each chunk is embedded by a local model — nothing leaves the machine.",
  },
  {
    icon: Database,
    title: "Index",
    body: "Vectors land in the search index, ready for grounded retrieval.",
  },
];

export default function ImportPage() {
  const [repository, setRepository] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const alive = useRef(true);

  // Must be re-armed on mount, not only cleared on unmount: StrictMode's
  // mount → unmount → remount would otherwise leave this false forever and
  // every import would be discarded as if the page had gone away.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const handleSubmit = async (url) => {
    setSubmitting(true);
    try {
      const created = await api.repos.import(url);
      if (!alive.current) return;
      setRepository(created);
      toast.success(`Indexing ${created.fullName ?? url} started`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      if (alive.current) setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-full">
      <div
        className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-72 opacity-70"
        style={{ maskImage: "linear-gradient(to bottom, black, transparent)" }}
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-[760px] px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <h1 className="text-gradient text-[34px] leading-tight font-semibold tracking-tight">
            Import a repository
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-ink-muted">
            Point RepoMind at any public GitHub repository. It clones, parses and embeds the source
            so every answer can cite the exact file and line.
          </p>
        </motion.div>

        <div className="mt-10">
          {repository ? (
            <IndexingProgress
              repository={repository}
              onReset={() => setRepository(null)}
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <ImportForm onSubmit={handleSubmit} submitting={submitting} />
            </motion.div>
          )}
        </div>

        {!repository && (
          <section className="mt-12">
            <h2 className="text-[11px] font-medium tracking-wider text-ink-faint uppercase">
              What happens next
            </h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {PIPELINE.map(({ icon: Icon, title, body }, position) => (
                <li
                  key={title}
                  className="flex gap-3 rounded-xl border border-line bg-surface/40 px-4 py-3.5"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-surface">
                    <Icon className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">
                      <span className="mr-1.5 tabular-nums text-ink-faint">{position + 1}</span>
                      {title}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-subtle">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
