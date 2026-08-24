"use client";

import { motion } from "framer-motion";
import {
  Braces,
  Cpu,
  Database,
  GitBranch,
  MessageSquareQuote,
  Radar,
  Scissors,
} from "lucide-react";
import { EASE, Reveal } from "@/components/landing/reveal";
import { Section, SectionHeading } from "@/components/landing/section";

const STEPS = [
  { icon: GitBranch, label: "Clone", detail: "Shallow clone, then walk the tree." },
  { icon: Braces, label: "Parse", detail: "Detect languages, read every source file." },
  { icon: Scissors, label: "Chunk", detail: "Split on structure, keep an overlap." },
  { icon: Cpu, label: "Embed", detail: "Vectors from a local Ollama model." },
  { icon: Database, label: "FAISS", detail: "Persist one index per repository." },
  { icon: Radar, label: "Retrieve", detail: "Top-k chunks for the question asked." },
  { icon: MessageSquareQuote, label: "Answer", detail: "Stream a grounded, cited response." },
];

export function PipelineDiagram() {
  return (
    <Section id="pipeline">
      <SectionHeading
        eyebrow="How it works"
        title="Seven steps from a GitHub URL to a cited answer"
        description="Indexing runs as a background job and reports each stage over server-sent events, so you can watch a repository come online."
      />

      <Reveal className="mt-14" y={24}>
        <div className="panel bg-surface/60 p-6 sm:p-10">
          <ol className="relative grid gap-8 lg:grid-cols-7 lg:gap-3">
            <span
              aria-hidden
              className="absolute bottom-5 left-5 top-5 w-px bg-line lg:hidden"
            />
            <motion.span
              aria-hidden
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, margin: "-72px" }}
              transition={{ duration: 1.1, ease: EASE }}
              style={{ left: "7.15%", right: "7.15%", transformOrigin: "left center" }}
              className="absolute top-5 hidden h-px bg-line-strong lg:block"
            />

            {STEPS.map(({ icon: Icon, label, detail }, index) => (
              <li
                key={label}
                className="relative flex items-start gap-4 lg:flex-col lg:items-center lg:gap-4 lg:text-center"
              >
                <motion.span
                  initial={{ opacity: 0, scale: 0.85 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-72px" }}
                  transition={{ duration: 0.4, delay: 0.12 + index * 0.09, ease: EASE }}
                  className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised"
                >
                  <Icon className="h-4 w-4 text-ink" aria-hidden />
                </motion.span>

                <Reveal delay={0.12 + index * 0.09} y={10} className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                    Step {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1.5 text-[14px] font-medium text-ink">{label}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-subtle">{detail}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </Reveal>
    </Section>
  );
}
