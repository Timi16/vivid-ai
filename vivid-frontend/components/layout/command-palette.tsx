"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/ui/modal";
import { ArtifactsIcon, PlusIcon, SearchIcon, SettingsIcon } from "@/components/ui/icons";
import { useChats } from "@/features/history/hooks/use-chats";
import { searchEntries } from "@/features/history/lib/filters";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon?: (props: { size?: number; className?: string }) => React.ReactNode;
  run: () => void;
}

// ⌘K. Jump to any chat by title, or run the few actions people reach for.
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const { data: chats = [] } = useChats();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  function close() {
    setQuery("");
    setCursor(0);
    onOpenChange(false);
  }

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      close();
      router.push(href);
    };
    const actions: Command[] = [
      { id: "new", label: "New chat", icon: PlusIcon, run: go("/") },
      { id: "artifacts", label: "Artifacts", icon: ArtifactsIcon, run: go("/artifacts") },
      { id: "settings", label: "Settings", icon: SettingsIcon, run: go("/settings") },
    ];
    const needle = query.trim().toLowerCase();
    const matchingActions = needle
      ? actions.filter((action) => action.label.toLowerCase().includes(needle))
      : actions;
    const matchingChats = searchEntries(chats, query)
      .slice(0, 12)
      .map<Command>((chat) => ({
        id: `chat-${chat.id}`,
        label: chat.title,
        hint: "Chat",
        run: go(`/thread/${chat.id}`),
      }));
    return [...matchingActions, ...matchingChats];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats, query, router]);

  const selected = Math.min(cursor, Math.max(commands.length - 1, 0));

  return (
    <Modal open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())} title="Search" hideTitle size="md">
      <div className="flex flex-col gap-2">
        <label className="vd-glass-control flex items-center gap-2.5 rounded-xl px-3">
          <SearchIcon size={16} className="text-fg/45 shrink-0" />
          <input
            autoFocus
            value={query}
            placeholder="Search chats or jump to…"
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, commands.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                commands[selected]?.run();
              }
            }}
            className="text-fg h-11 w-full bg-transparent text-[14.5px] outline-none"
          />
        </label>

        <ul className="max-h-[360px] overflow-y-auto">
          {commands.length === 0 ? (
            <li className="text-fg/40 px-3 py-4 text-[13px]">No matches.</li>
          ) : null}
          {commands.map((command, index) => {
            const Icon = command.icon;
            return (
              <li key={command.id}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={command.run}
                  className={cn(
                    "flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-[13.5px]",
                    index === selected ? "bg-fg/10 text-fg" : "text-fg/70"
                  )}
                >
                  {Icon ? <Icon size={16} className="text-fg/50 shrink-0" /> : <span className="w-4" />}
                  <span className="flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="text-fg/35 text-[11px]">{command.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
