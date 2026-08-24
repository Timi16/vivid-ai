"use client";

import { useState } from "react";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { Modal } from "@/components/ui/modal";
import { ShortcutsPanel } from "@/features/settings";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// The app shell. Every page renders inside it, and it is the one place below
// app/ allowed to compose features.
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  return (
    <div className="relative isolate flex h-dvh w-full overflow-hidden">
      <AmbientBackdrop />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <Modal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title="Keyboard shortcuts"
        size="md"
      >
        <ShortcutsPanel />
      </Modal>
    </div>
  );
}
