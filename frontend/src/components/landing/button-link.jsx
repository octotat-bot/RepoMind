import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A real anchor that looks like a Button.
 *
 * The inner button leaves the tab order so the pair is a single stop for
 * keyboards while crawlers still see an href.
 */
export function ButtonLink({ href, linkClassName, ...props }) {
  return (
    <Link href={href} className={cn("inline-flex rounded-xl", linkClassName)}>
      <Button tabIndex={-1} {...props} />
    </Link>
  );
}
