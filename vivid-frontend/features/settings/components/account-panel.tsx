"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LogOutIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { useUpdateName } from "@/features/auth/hooks/use-me";
import { SettingGroup, SettingRow } from "@/features/settings/components/setting-row";

interface AccountPanelProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  plan: string;
  // Rendered in the plan row. The route passes it so settings never imports the
  // billing slice.
  planActionSlot?: React.ReactNode;
}

export function AccountPanel({ name, email, avatarUrl, plan, planActionSlot }: AccountPanelProps) {
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const updateName = useUpdateName();

  async function saveName() {
    const next = draftName.trim();
    if (!next || next === name) {
      setEditingName(false);
      return;
    }
    try {
      await updateName.mutateAsync(next);
      setEditingName(false);
      toast("Name updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update your name");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingGroup>
        <div className="flex items-center gap-4 p-4">
          <Avatar name={name} src={avatarUrl} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-fg truncate text-[15px] font-semibold">{name}</span>
            <span className="text-fg/50 truncate text-[12.5px] font-normal">{email}</span>
          </div>
        </div>
        <SettingRow
          label="Display name"
          detail="How Vivid addresses you across the app."
          control={
            editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  className="h-8 w-[180px]"
                />
                <Button size="sm" onClick={() => void saveName()} disabled={updateName.isPending}>
                  Save
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraftName(name);
                  setEditingName(true);
                }}
              >
                Edit
              </Button>
            )
          }
        />
        <SettingRow label="Plan" detail={`You are on ${plan}.`} control={planActionSlot} />
      </SettingGroup>

      <SettingGroup title="Session">
        <SettingRow
          label="Sign out"
          detail="Sign out of Vivid on this device."
          control={
            <Button variant="secondary" size="sm" onClick={() => setSignOutOpen(true)}>
              <LogOutIcon size={15} />
              Sign out
            </Button>
          }
        />
      </SettingGroup>

      <SettingGroup title="Danger zone">
        <SettingRow
          label="Delete account"
          detail="Removes your account, threads, spaces and generated media. This cannot be undone."
          control={
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          }
        />
      </SettingGroup>

      <ConfirmDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign out of Vivid?"
        description="You will need to sign in again to get back to your threads."
        confirmLabel="Sign out"
        onConfirm={() => {
          setSignOutOpen(false);
          router.push("/sign-in");
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title="Delete your account?"
        description="Every thread, space and generated file is removed permanently. This cannot be undone."
        confirmLabel="Delete account"
        onConfirm={() => {
          setDeleteOpen(false);
          toast("Account deletion isn't available yet", {
            description: "This turns on once the account service ships.",
          });
        }}
      />
    </div>
  );
}
