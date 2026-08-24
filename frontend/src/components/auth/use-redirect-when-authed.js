"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

/**
 * Keep signed-in users off the auth pages.
 *
 * Bootstraps the session first so a page reload with a valid refresh token
 * lands back on the dashboard instead of asking for credentials again.
 */
export function useRedirectWhenAuthed(destination = "/dashboard") {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    if (status === "loading") bootstrap();
  }, [status, bootstrap]);

  useEffect(() => {
    if (status === "authenticated") router.replace(destination);
  }, [status, router, destination]);

  return status;
}
