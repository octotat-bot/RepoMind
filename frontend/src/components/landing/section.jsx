import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

export function Container({ className, children }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>
  );
}

export function Section({ id, className, children }) {
  return (
    // scroll-mt clears the sticky nav when an anchor link jumps here.
    <section id={id} className={cn("scroll-mt-20 py-20 sm:py-28", className)}>
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "center" }) {
  const centered = align === "center";

  return (
    <Reveal className={cn("max-w-2xl", centered && "mx-auto text-center")}>
      {eyebrow && (
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[34px]">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">{description}</p>
      )}
    </Reveal>
  );
}
