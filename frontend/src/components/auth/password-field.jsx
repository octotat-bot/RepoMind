"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Password input with a reveal toggle and an optional strength meter. */
export const PasswordField = forwardRef(function PasswordField(
  { label, hint, error, id, showStrength = false, value = "", ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          className={cn(
            "w-full h-11 rounded-xl bg-surface border border-line px-3.5 pr-11 text-sm text-ink",
            "placeholder:text-ink-faint transition-colors duration-150",
            "hover:border-line-strong focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/10",
            error && "border-critical/50",
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-faint transition-colors hover:bg-surface-hover hover:text-ink-muted"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {showStrength && value.length > 0 && <StrengthMeter password={value} />}
    </Field>
  );
});

const LEVELS = [
  { label: "Too short", color: "bg-critical", width: "20%" },
  { label: "Weak", color: "bg-critical", width: "40%" },
  { label: "Fair", color: "bg-caution", width: "60%" },
  { label: "Good", color: "bg-info", width: "80%" },
  { label: "Strong", color: "bg-positive", width: "100%" },
];

/** Rough entropy proxy — length matters most, variety breaks ties. */
function scorePassword(password) {
  if (password.length < 8) return 0;

  let score = 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  if (classes >= 3) score += 1;

  return Math.min(score, LEVELS.length - 1);
}

function StrengthMeter({ password }) {
  const level = LEVELS[scorePassword(password)];

  return (
    <div className="flex items-center gap-2.5 pt-0.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-raised">
        <div
          className={cn("h-full rounded-full transition-all duration-300", level.color)}
          style={{ width: level.width }}
        />
      </div>
      <span className="w-16 text-right text-[11px] text-ink-subtle">{level.label}</span>
    </div>
  );
}
