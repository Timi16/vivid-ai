"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { CommandPalette } from "@/components/layout/command-palette";
import { Modal } from "@/components/ui/modal";
import { ShortcutsPanel } from "@/features/settings";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

// The app shell. Every page renders inside it, and it is the one place below
// app/ allowed to compose features. On desktop the sidebar is a collapsible
// column; on phones it is a drawer over the content.
export function AppShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  // The drawer remembers which path it was opened on: navigating changes the
  // path, which closes it, so tapping a chat on a phone shows the chat.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = (open: boolean) => setDrawerPath(open ? pathname : null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const sidebar = (
    <Sidebar
      collapsed={isMobile ? false : collapsed}
      onToggle={() => (isMobile ? setDrawerOpen(false) : setCollapsed((prev) => !prev))}
      onOpenSearch={() => setSearchOpen(true)}
      onShowShortcuts={() => setShortcutsOpen(true)}
      className={cn(isMobile && "h-full")}
    />
  );

  return (
    <div className="relative isolate flex h-dvh w-full overflow-hidden">
      <AmbientBackdrop />

      {isMobile ? (
        drawerOpen ? (
          <div className="fixed inset-0 z-40 flex">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/50"
            />
            <div className="relative h-full">{sidebar}</div>
          </div>
        ) : null
      ) : (
        sidebar
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenSidebar={() => setDrawerOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />

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
