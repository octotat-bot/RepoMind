"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { useRedirectWhenAuthed } from "@/components/auth/use-redirect-when-authed";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useAuthStore } from "@/lib/auth-store";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);
  useRedirectWhenAuthed();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Preserve where the user was headed before the session check bounced them.
  const next = searchParams.get("next") ?? "/dashboard";

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (caught) {
      setError(caught.message ?? "Could not sign you in.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Pick up where you left off with your indexed repositories."
      footer={
        <>
          New here?{" "}
          <Link
            href="/register"
            className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-white/60"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-critical/25 bg-critical/10 px-3.5 py-3"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" aria-hidden />
            <p className="text-[13px] leading-relaxed text-critical">{error}</p>
          </div>
        )}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <PasswordField
          id="password"
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!email.trim() || !password}
        >
          Sign in
          {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <LoginForm />
    </Suspense>
  );
}
