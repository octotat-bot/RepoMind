"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/auth-store";
import { formatRelativeTime } from "@/lib/utils";

export function SessionSection() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [confirming, setConfirming] = useState(false);

  const signOut = () => {
    logout();
    router.push("/login");
  };

  return (
    <>
      <SettingsSection
        title="Session"
        description="Tokens are stored in this browser only."
        delay={0.15}
        footer={
          <>
            <p className="text-[12px] text-ink-faint">
              Account created {formatRelativeTime(user?.createdAt)}.
            </p>
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              Sign out
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={signOut}
        title="Sign out of RepoMind?"
        description="Your indexed repositories stay on this machine. You will need to sign in again to query them."
        confirmLabel="Sign out"
        destructive
      />
    </>
  );
}
