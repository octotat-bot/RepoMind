import {
  CircleSlash,
  Cpu,
  History,
  MessageSquareQuote,
  Network,
  ScanSearch,
} from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { Section, SectionHeading } from "@/components/landing/section";
import { Card } from "@/components/ui/primitives";

const FEATURES = [
  {
    icon: ScanSearch,
    title: "Semantic code search",
    description:
      "Describe what the code does and get the right files back — no exact identifier or grep pattern required.",
  },
  {
    icon: MessageSquareQuote,
    title: "Grounded chat with citations",
    description:
      "Every answer names the files and line ranges it was built from, so you can verify instead of trust.",
  },
  {
    icon: Network,
    title: "Architecture generator",
    description:
      "A readable map of modules, entry points and dependencies, generated from the source rather than the README.",
  },
  {
    icon: CircleSlash,
    title: "Dead-code detection",
    description:
      "Surface unreferenced functions, unused exports and files that nothing in the tree imports.",
  },
  {
    icon: Cpu,
    title: "Local-first AI",
    description:
      "Ollama handles embeddings and generation on your own hardware. No API keys, no source leaving the machine.",
  },
  {
    icon: History,
    title: "Per-repo conversation memory",
    description:
      "Threads are scoped to a repository, so context follows the codebase instead of the browser tab.",
  },
];

export function FeatureGrid() {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Capabilities"
        title="Everything you need to get oriented in unfamiliar code"
        description="Retrieval, reasoning and static analysis over one index — built for the moment you inherit a repository you have never seen."
      />

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }, index) => (
          <Reveal key={title} delay={index * 0.06}>
            <Card interactive className="h-full p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-raised">
                <Icon className="h-4 w-4 text-ink" aria-hidden />
              </span>
              <h3 className="mt-5 text-[15px] font-medium tracking-[-0.01em] text-ink">
                {title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">{description}</p>
            </Card>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
