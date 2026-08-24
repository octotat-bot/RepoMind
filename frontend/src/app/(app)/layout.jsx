"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { Spinner } from "@/components/ui/primitives";
import { useAuthStore } from "@/lib/auth-store";
import { api } from "@/lib/api";

/**
 * Shell for every authenticated page.
 *
 * Rendering is gated on the session check so protected content never flashes
 * before the redirect, and repositories are loaded once here to power the
 * command palette across all pages.
 */
export default function AppLayout({ children }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const [repositories, setRepositories] = useState([]);

  useEffect(() => {
    if (status === "loading") bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    api.repos
      .list()
      .then(setRepositories)
      .catch(() => setRepositories([]));
  }, [status]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar footer={<UserMenu />} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <CommandPalette repositories={repositories} />
    </div>
  );
}
