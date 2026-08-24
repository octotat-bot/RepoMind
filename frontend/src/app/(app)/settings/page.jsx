"use client";

import { motion } from "framer-motion";
import { PasswordSection } from "@/components/settings/password-section";
import { ProfileSection } from "@/components/settings/profile-section";
import { SessionSection } from "@/components/settings/session-section";
import { SystemSection } from "@/components/settings/system-section";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-10 sm:px-8">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-gradient text-[26px] font-semibold tracking-tight">Settings</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Your account and the local services RepoMind depends on.
        </p>
      </motion.header>

      <div className="mt-8 space-y-5">
        <ProfileSection />
        <PasswordSection />
        <SystemSection />
        <SessionSection />
      </div>
    </div>
  );
}
