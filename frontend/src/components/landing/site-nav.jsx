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
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        lifted
          ? "border-line bg-canvas/72 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Wordmark />

        <nav className="hidden flex-1 items-center gap-0.5 md:flex" aria-label="Page sections">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3 py-2 text-[13px] font-medium text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
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
