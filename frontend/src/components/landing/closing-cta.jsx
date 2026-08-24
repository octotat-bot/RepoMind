import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/landing/button-link";
import { Reveal } from "@/components/landing/reveal";
import { Section } from "@/components/landing/section";

const GLOW =
  "radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,255,255,0.09), transparent)";

export function ClosingCta() {
  return (
    <Section>
      <Reveal y={24}>
        <div className="panel relative overflow-hidden bg-surface/60 px-6 py-16 text-center sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute inset-0" style={{ background: GLOW }} aria-hidden />
          <div
            className="grid-backdrop pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
          />

          <div className="relative mx-auto max-w-xl">
            <h2 className="text-gradient pb-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[40px]">
              Point it at a repository and ask.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
              Indexing a mid-sized project takes a few minutes. After that, every question you
              have about it comes back with citations you can check.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink
                href="/register"
                variant="primary"
                size="lg"
                linkClassName="w-full sm:w-auto"
                className="w-full sm:w-auto"
              >
                Create an account
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink
                href="/login"
                variant="outline"
                size="lg"
                linkClassName="w-full sm:w-auto"
                className="w-full sm:w-auto"
              >
                I already have one
              </ButtonLink>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
