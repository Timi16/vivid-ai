"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { KeyboardIcon, LogOutIcon, SettingsIcon, SparkIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface AccountMenuProps {
  name: string;
  avatarUrl?: string | null;
  plan: string;
  collapsed: boolean;
  onShowShortcuts: () => void;
}

export function AccountMenu({
  name,
  avatarUrl,
  plan,
  collapsed,
  onShowShortcuts,
}: AccountMenuProps) {
  const router = useRouter();
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <>
      <Menu
        side="top"
        align="start"
        trigger={
          <button
            type="button"
            aria-label="Account menu"
            className={cn(
              "flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-1.5 py-1.5",
              "hover:bg-fg/8 transition-colors"
            )}
          >
            <Avatar name={name} src={avatarUrl} size="sm" />
            {!collapsed ? (
              <span className="flex min-w-0 flex-col items-start">
                <span className="text-fg/85 truncate text-[13px] font-semibold">{name}</span>
                <span className="text-fg/40 truncate text-[11px] font-normal">{plan}</span>
              </span>
            ) : null}
          </button>
        }
      >
        <MenuItem onClick={() => router.push("/settings")}>
          <SettingsIcon size={15} />
          Settings
        </MenuItem>
        <MenuItem onClick={onShowShortcuts}>
          <KeyboardIcon size={15} />
          Keyboard shortcuts
        </MenuItem>
        <MenuItem onClick={() => router.push("/upgrade")}>
          <SparkIcon size={15} />
          Upgrade plan
        </MenuItem>
        <MenuSeparator />
        <MenuItem tone="danger" onClick={() => setSignOutOpen(true)}>
          <LogOutIcon size={15} />
          Sign out
        </MenuItem>
      </Menu>

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
    </>
  );
}

// Kept here so the sidebar can render a link without pulling in the menu.
export { Link as AccountLink };
