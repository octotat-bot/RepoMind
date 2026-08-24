import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

const STACK = [
  "Next.js 15",
  "React 19",
  "FastAPI",
  "LangChain",
  "FAISS",
  "Ollama",
  "PostgreSQL",
  "Prisma",
  "Tailwind",
];

export function TechStrip() {
  return (
    <Section id="stack" className="scroll-mt-20 py-4 sm:py-8">
      <Reveal>
        <div className="panel bg-surface/50 px-6 py-8 sm:px-10">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:gap-12">
            <div className="lg:w-72 lg:shrink-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                Built with
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-subtle">
                Well-understood pieces, chosen so the entire stack — models included — runs on a
                single laptop.
              </p>
            </div>

            <ul className="flex flex-wrap gap-2">
              {STACK.map((item) => (
                <li key={item}>
                  <span className="inline-flex items-center rounded-lg border border-line bg-surface-raised px-3 py-1.5 font-mono text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
