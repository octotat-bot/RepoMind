"use client";

import { motion } from "framer-motion";

/** The single easing curve every RepoMind transition shares. */
export const EASE = [0.16, 1, 0.3, 1];

/** Fade-and-rise that fires once when the element scrolls into view. */
export function Reveal({ children, delay = 0, y = 18, duration = 0.5, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-72px" }}
      transition={{ duration, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
