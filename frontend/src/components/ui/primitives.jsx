"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/* ── Surface ──────────────────────────────────────────────────────────────── */

export function Card({ className, interactive = false, children, ...props }) {
  return (
    <div
      className={cn(
        "panel relative overflow-hidden",
        interactive &&
          "transition-all duration-200 hover:border-line-strong hover:bg-surface-raised",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Separator({ className, orientation = "horizontal" }) {
  return (
    <div
      role="separator"
      className={cn(
        "bg-line shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "w-px h-full",
        className,
      )}
    />
  );
}

/* ── Form controls ────────────────────────────────────────────────────────── */

export const Input = forwardRef(function Input(
  { className, icon: Icon, ...props },
  ref,
) {
  return (
    <div className="relative w-full">
      {Icon && (
        <Icon
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
      )}
      <input
        ref={ref}
        className={cn(
          "w-full h-11 rounded-xl bg-surface border border-line px-3.5 text-sm text-ink",
          "placeholder:text-ink-faint transition-colors duration-150",
          "hover:border-line-strong focus:border-white/25 focus:outline-none",
          "focus:ring-2 focus:ring-white/10",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          Icon && "pl-9",
          className,
        )}
        {...props}
      />
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-xl bg-surface border border-line px-3.5 py-3 text-sm text-ink",
        "placeholder:text-ink-faint resize-none transition-colors duration-150",
        "hover:border-line-strong focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/10",
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-muted">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12px] text-critical">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

/* ── Indicators ───────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: "bg-surface-raised text-ink-muted border-line",
  active: "bg-info/10 text-info border-info/25",
  positive: "bg-positive/10 text-positive border-positive/25",
  caution: "bg-caution/10 text-caution border-caution/25",
  critical: "bg-critical/10 text-critical border-critical/25",
  contrast: "bg-ink text-canvas border-transparent",
};

export function Badge({ tone = "neutral", className, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-medium tracking-wide whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse = false }) {
  const colors = {
    neutral: "bg-ink-faint",
    active: "bg-info",
    positive: "bg-positive",
    caution: "bg-caution",
    critical: "bg-critical",
  };
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {pulse && (
        <span
          className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", colors[tone])}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", colors[tone])} />
    </span>
  );
}

export function Progress({ value = 0, tone = "default", className }) {
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-raised", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "critical" ? "bg-critical" : "bg-ink",
        )}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

export function Kbd({ children, className }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line",
        "bg-surface-raised px-1.5 font-mono text-[10px] font-medium text-ink-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ── Loading ──────────────────────────────────────────────────────────────── */

export function Skeleton({ className }) {
  return <div className={cn("shimmer rounded-lg", className)} aria-hidden />;
}

export function Spinner({ className }) {
  return (
    <div
      className={cn(
        "h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink",
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-16 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface">
          <Icon className="h-5 w-5 text-ink-subtle" aria-hidden />
        </div>
      )}
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {description && (
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-subtle">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
