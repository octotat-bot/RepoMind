"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PasswordField } from "@/components/auth/password-field";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const MIN_LENGTH = 8;
const EMPTY = { current: "", next: "", confirm: "" };

export function PasswordSection() {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const update = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const tooShort = form.next.length > 0 && form.next.length < MIN_LENGTH;
  const canSubmit =
    form.current.length > 0 && form.next.length >= MIN_LENGTH && form.next === form.confirm;

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.auth.changePassword({
        currentPassword: form.current,
        newPassword: form.next,
      });
      setForm(EMPTY);
      toast.success("Password updated.");
    } catch (error) {
      toast.error(error.message ?? "Could not update your password.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <SettingsSection
        title="Password"
        description="Existing sessions stay signed in after a change."
        delay={0.05}
        footer={
          <>
            <p className="text-[12px] text-ink-faint">
              Use at least {MIN_LENGTH} characters.
            </p>
            <Button type="submit" variant="primary" size="sm" loading={saving} disabled={!canSubmit}>
              Update password
            </Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <PasswordField
            id="current-password"
            label="Current password"
            autoComplete="current-password"
            value={form.current}
            onChange={update("current")}
          />
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            showStrength
            value={form.next}
            onChange={update("next")}
            error={tooShort ? `At least ${MIN_LENGTH} characters.` : undefined}
          />
          <PasswordField
            id="confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={update("confirm")}
            error={mismatch ? "Passwords do not match." : undefined}
          />
        </div>
      </SettingsSection>
    </form>
  );
}
