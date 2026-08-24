"use client";

import { useMounted } from "@/hooks/use-mounted";
import { SHORTCUT_GROUPS } from "@/features/settings/lib/data";
import { SettingGroup } from "@/features/settings/components/setting-row";

function Key({ label }: { label: string }) {
  return (
    <kbd className="vd-glass-control text-fg/80 grid h-6 min-w-6 place-items-center rounded-[7px] px-1.5 font-sans text-[11px] font-semibold">
      {label}
    </kbd>
  );
}

export function ShortcutsPanel() {
  // The modifier label differs by platform, and navigator is not available on
  // the server. Render the neutral label until mounted so the markup matches.
  const mounted = useMounted();
  const isMac =
    mounted && typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl";

  return (
    <div className="flex flex-col gap-6">
      {SHORTCUT_GROUPS.map((group) => (
        <SettingGroup key={group.title} title={group.title}>
          {group.shortcuts.map((shortcut) => (
            <div
              key={shortcut.action}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <span className="text-fg/85 text-[13px] font-medium">{shortcut.action}</span>
              <span className="flex shrink-0 items-center gap-1">
                {shortcut.keys.map((key) => (
                  <Key key={key} label={key === "Mod" ? mod : key} />
                ))}
              </span>
            </div>
          ))}
        </SettingGroup>
      ))}
    </div>
  );
}
