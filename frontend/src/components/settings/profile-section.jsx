"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/primitives";
import { useAuthStore } from "@/lib/auth-store";

export function ProfileSection() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);

  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  // The store hydrates after mount, so seed the field once the user arrives.
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const dirty = name.trim() !== (user?.name ?? "") && name.trim().length > 0;

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ name: name.trim() });
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(error.message ?? "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="Profile"
      description="How you appear inside RepoMind."
      footer={
        <>
          <p className="text-[12px] text-ink-faint">
            {dirty ? "You have unsaved changes." : "Everything is up to date."}
          </p>
          <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Display name" htmlFor="profile-name">
          <Input
            id="profile-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
          />
        </Field>

        <Field
          label="Email"
          htmlFor="profile-email"
          hint="Your email is the identity your repositories belong to and cannot be changed."
        >
          <Input id="profile-email" value={user?.email ?? ""} disabled readOnly />
        </Field>
      </div>
    </SettingsSection>
  );
}
