"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/primitives";

/** Titled card with an optional right-aligned action footer. */
export function SettingsSection({ title, description, footer, delay = 0, children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card>
        <div className="p-6">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-subtle">{description}</p>
          )}
          {children && <div className="mt-6">{children}</div>}
        </div>
        {footer && (
          <div className="flex items-center justify-between gap-4 border-t border-line bg-surface-raised/40 px-6 py-3.5">
            {footer}
          </div>
        )}
      </Card>
    </motion.section>
  );
}
