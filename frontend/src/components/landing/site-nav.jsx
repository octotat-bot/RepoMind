"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/landing/button-link";
import { Wordmark } from "@/components/landing/wordmark";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { href: "#features", label: "Features" },
  { href: "#pipeline", label: "How it works" },
  { href: "#stack", label: "Stack" },
];

export function SiteNav() {
  const [lifted, setLifted] = useState(false);

  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Floating pill rather than a full-width bar: the page has a lot of dark
    // space, and a detached nav keeps the hero feeling open. `sticky` with a
    // transparent wrapper means it floats without reserving layout height.
    <header className="pointer-events-none sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex h-14 w-full max-w-5xl items-center gap-6",
          "rounded-2xl px-3 pr-2 sm:px-5 sm:pr-3",
          "transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300",
          lifted
            ? // Glass only once scrolled; over the hero it would blur the
              // gradient behind it and muddy the first impression.
              "border border-white/10 bg-canvas/60 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl backdrop-saturate-150"
            : "border border-transparent bg-transparent",
        )}
      >
        <Wordmark />

        <nav className="hidden flex-1 items-center gap-0.5 md:flex" aria-label="Page sections">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-subtle transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/register" variant="primary" size="sm">
            Get started
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
