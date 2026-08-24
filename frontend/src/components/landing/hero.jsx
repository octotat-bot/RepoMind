"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { ButtonLink } from "@/components/landing/button-link";
import { ProductPreview } from "@/components/landing/product-preview";
import { EASE } from "@/components/landing/reveal";
import { Container } from "@/components/landing/section";
import { Dot } from "@/components/ui/primitives";

const GRID_FADE =
  "radial-gradient(ellipse 72% 62% at 50% 0%, #000 45%, rgba(0,0,0,0.35) 72%, transparent 100%)";

const GLOW =
  "radial-gradient(closest-side, rgba(255,255,255,0.11), rgba(255,255,255,0.03), transparent)";

const PROOF = [
  "Ollama + FAISS, fully local",
  "No OpenAI key",
  "Citations on every answer",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-14 sm:pb-32 sm:pt-20">
      <Backdrop />

      <Container className="relative">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Rise delay={0}>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[12px] text-ink-muted backdrop-blur">
              <Dot tone="positive" pulse />
              Local-first retrieval for real codebases
            </span>
          </Rise>

          <Rise delay={0.06}>
            <h1 className="text-gradient mt-7 pb-1 text-[40px] font-semibold leading-[1.03] tracking-[-0.035em] sm:text-[60px] lg:text-[68px]">
              Understand any codebase in minutes, not weeks.
            </h1>
          </Rise>

          <Rise delay={0.12}>
            <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-muted sm:text-base">
              RepoMind indexes any GitHub repository — cloning, parsing, chunking and embedding
              every file — then answers your questions in plain English with the exact files and
              line ranges the answer came from. Embeddings and generation run on local models
              through Ollama, vectors live in FAISS, and nothing is sent to OpenAI.
            </p>
          </Rise>

          <Rise delay={0.18}>
            <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <ButtonLink
                href="/register"
                variant="primary"
                size="lg"
                linkClassName="w-full sm:w-auto"
                className="w-full sm:w-auto"
              >
                Import a repository
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink
                href="/login"
                variant="secondary"
                size="lg"
                linkClassName="w-full sm:w-auto"
                className="w-full sm:w-auto"
              >
                Sign in
              </ButtonLink>
            </div>
          </Rise>

          <Rise delay={0.24}>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {PROOF.map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-[12px] text-ink-subtle">
                  <Check className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Rise>
        </div>

        <ProductPreview />
      </Container>
    </section>
  );
}

function Rise({ delay, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="grid-backdrop absolute inset-0"
        style={{ maskImage: GRID_FADE, WebkitMaskImage: GRID_FADE }}
      />
      <div
        className="absolute left-1/2 top-[-260px] h-[620px] w-[min(1180px,140%)] -translate-x-1/2 blur-2xl"
        style={{ background: GLOW }}
      />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-canvas" />
    </div>
  );
}
