"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { onBackendWake } from "@/lib/api";

/**
 * Banner shown while the API is waking from sleep.
 *
 * Deployed on a free tier, the backend spins down after 15 minutes idle and
 * takes about a minute to come back. Saying so is the difference between "this
 * is booting" and "this is broken".
 */
export function ColdStartNotice() {
  const [waking, setWaking] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => onBackendWake((state) => setWaking(state === "waking")), []);

  useEffect(() => {
    if (!waking) {
      setSeconds(0);
      return undefined;
    }
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [waking]);

  return (
    <AnimatePresence>
      {waking && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 top-4 z-[200] mx-auto w-fit max-w-[92vw]"
        >
          <div className="glass flex items-center gap-3 rounded-full px-4 py-2.5 shadow-2xl">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-muted" aria-hidden />
            <p className="text-[13px] text-ink">
              Waking the server
              <span className="text-ink-subtle">
                {" — free hosting sleeps when idle, this takes up to a minute"}
              </span>
            </p>
            {seconds > 0 && (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
                {seconds}s
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
