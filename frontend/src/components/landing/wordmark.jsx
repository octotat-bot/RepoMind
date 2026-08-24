import Link from "next/link";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-7 w-7 rounded-lg", icon: "h-4 w-4", label: "text-[15px]" },
  lg: { box: "h-9 w-9 rounded-xl", icon: "h-5 w-5", label: "text-[17px]" },
};

export function Wordmark({ href = "/", size = "sm", className }) {
  const scale = SIZES[size] ?? SIZES.sm;

  const mark = (
    <>
      <span className={cn("flex items-center justify-center bg-ink", scale.box)}>
        <Boxes className={cn("text-canvas", scale.icon)} aria-hidden />
      </span>
      <span className={cn("font-semibold tracking-tight text-ink", scale.label)}>RepoMind</span>
    </>
  );

  if (!href) {
    return <span className={cn("flex items-center gap-2.5", className)}>{mark}</span>;
  }

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 transition-opacity hover:opacity-80",
        className,
      )}
    >
      {mark}
    </Link>
  );
}
