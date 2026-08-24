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
    // A centred pill that hugs its content, rather than a bar spanning the
    // page. `sticky` on a transparent, click-through wrapper lets it float
    // without reserving layout height or blocking the hero beneath it.
    <header className="pointer-events-none sticky top-0 z-50 flex justify-center px-3 pt-3 sm:pt-5">
      <div
        className={cn(
          "pointer-events-auto flex h-12 w-fit max-w-full items-center gap-1.5 sm:gap-3",
          "rounded-full border pl-3 pr-1.5 sm:pl-4 sm:pr-2",
          "transition-[background-color,border-color,box-shadow] duration-500",
          // Deliberately faint. The blur is always on so text stays legible
          // over whatever scrolls beneath, while the fill stays low enough to
          // read as glass rather than as a solid bar.
          "backdrop-blur-2xl backdrop-saturate-150",
          lifted
            ? "border-white/[0.09] bg-white/[0.055] shadow-[0_10px_40px_-16px_rgba(0,0,0,0.95)]"
            : "border-white/[0.05] bg-white/[0.025]",
        )}
      >
        <Wordmark />

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Page sections">
          {SECTIONS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-subtle transition-colors hover:bg-white/[0.07] hover:text-ink"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Hairline separating navigation from actions, so the pill reads as
            two groups rather than one undifferentiated row. */}
        <span className="hidden h-5 w-px bg-white/10 md:block" aria-hidden />

        <div className="flex items-center gap-1.5">
          <ButtonLink
            href="/login"
            variant="ghost"
            size="sm"
            className="rounded-full px-3"
            linkClassName="rounded-full"
          >
            Sign in
          </ButtonLink>
          <ButtonLink
            href="/register"
            variant="primary"
            size="sm"
            className="rounded-full px-4"
            linkClassName="rounded-full"
          >
            Get started
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
