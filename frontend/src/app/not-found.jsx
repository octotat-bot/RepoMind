import { House, LayoutGrid } from "lucide-react";
import { ButtonLink } from "@/components/landing/button-link";
import { Wordmark } from "@/components/landing/wordmark";

export const metadata = {
  title: "Page not found",
};

const GRID_FADE =
  "radial-gradient(ellipse 70% 60% at 50% 40%, #000 30%, transparent 100%)";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas">
      <div
        className="grid-backdrop pointer-events-none absolute inset-0"
        style={{ maskImage: GRID_FADE, WebkitMaskImage: GRID_FADE }}
        aria-hidden
      />

      <header className="relative flex h-16 items-center px-5 sm:px-8">
        <Wordmark />
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center px-5 pb-24 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Error 404
        </p>

        <p
          className="text-gradient mt-5 text-[104px] font-semibold leading-none tracking-[-0.06em] sm:text-[144px]"
          aria-hidden
        >
          404
        </p>

        <h1 className="mt-7 text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-[26px]">
          This page is not in the index.
        </h1>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-ink-muted">
          The link is either stale or the repository it pointed at has been removed. Everything
          else is exactly where you left it.
        </p>

        <div className="mt-10 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <ButtonLink
            href="/"
            variant="primary"
            size="lg"
            linkClassName="w-full sm:w-auto"
            className="w-full sm:w-auto"
          >
            <House className="h-4 w-4" aria-hidden />
            Back to home
          </ButtonLink>
          <ButtonLink
            href="/dashboard"
            variant="secondary"
            size="lg"
            linkClassName="w-full sm:w-auto"
            className="w-full sm:w-auto"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Go to dashboard
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
