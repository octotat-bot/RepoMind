"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { useRedirectWhenAuthed } from "@/components/auth/use-redirect-when-authed";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useAuthStore } from "@/lib/auth-store";

const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  useRedirectWhenAuthed();

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const passwordTooShort =
    form.password.length > 0 && form.password.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    form.name.trim() && form.email.trim() && form.password.length >= MIN_PASSWORD_LENGTH;

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(form.name.trim(), form.email.trim(), form.password);
      router.replace("/dashboard");
    } catch (caught) {
      setError(caught.message ?? "Could not create your account.");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Import a repository and start asking questions in about a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-white/60"
          >
            Sign in
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

        <Field label="Name" htmlFor="name">
          <Input
            id="name"
            required
            autoComplete="name"
            autoFocus
            placeholder="Ada Lovelace"
            value={form.name}
            onChange={update("name")}
          />
        </Field>

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={update("email")}
          />
        </Field>

        <PasswordField
          id="password"
          label="Password"
          required
          showStrength
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={form.password}
          onChange={update("password")}
          error={passwordTooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          hint={!form.password ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={!canSubmit}
        >
          Create account
          {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>

        <p className="text-center text-[11px] leading-relaxed text-ink-faint">
          Everything runs locally against your own Ollama instance. No code is sent to a
          third-party model provider.
        </p>
      </form>
    </AuthShell>
  );
}
