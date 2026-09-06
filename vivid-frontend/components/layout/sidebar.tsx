"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PencilIcon, PlusIcon, SearchIcon, SidebarIcon, TrashIcon } from "@/components/ui/icons";
import { AccountMenu } from "@/components/layout/account-menu";
import { primaryNav, secondaryNav } from "@/components/layout/nav-items";
import { displayName, useMe } from "@/hooks/use-me";
import { useChats, useDeleteChat, useUpdateChat } from "@/features/history/hooks/use-chats";
import type { HistoryEntry } from "@/features/history/lib/data";
import { groupByAge } from "@/features/history/lib/filters";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSearch: () => void;
  onShowShortcuts: () => void;
  className?: string;
}

// The sidebar is the user's conversations. New chat and search on top, recent
// chats grouped by age in the middle (pinned ones first), the rest of the app
// and the account at the bottom.
export function Sidebar({
  collapsed,
  onToggle,
  onOpenSearch,
  onShowShortcuts,
  className,
}: SidebarProps) {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: chats = [] } = useChats();

  const pinned = chats.filter((chat) => chat.pinned);
  const groups = groupByAge(chats.filter((chat) => !chat.pinned));

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "vd-glass relative z-10 flex shrink-0 flex-col border-y-0 border-l-0 border-r-white/10 transition-[width] duration-200",
        collapsed ? "w-[64px]" : "w-[260px]",
        className
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed ? (
          <Link href="/" className="ws-display text-fg px-1 text-[17px]">
            Vivid
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="hover:vd-glass-control text-fg/55 hover:text-fg grid size-9 cursor-pointer place-items-center rounded-lg transition-colors"
        >
          <SidebarIcon size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2">
        <RailButton
          href="/"
          label="New chat"
          icon={PlusIcon}
          collapsed={collapsed}
          active={pathname === "/"}
        />
        <RailButton
          label="Search"
          icon={SearchIcon}
          collapsed={collapsed}
          onClick={onOpenSearch}
          hint="⌘K"
        />
        {primaryNav.map(({ label, href, icon }) => (
          <RailButton
            key={href}
            href={href}
            label={label}
            icon={icon}
            collapsed={collapsed}
            active={pathname === href}
          />
        ))}
      </div>

      {!collapsed ? (
        <nav aria-label="Recent chats" className="mt-3 min-h-0 flex-1 overflow-y-auto px-2">
          {pinned.length ? <ChatGroup label="Pinned" entries={pinned} pathname={pathname} /> : null}
          {groups.map((group) => (
            <ChatGroup
              key={group.label}
              label={group.label}
              entries={group.entries}
              pathname={pathname}
            />
          ))}
          {!chats.length ? (
            <p className="text-fg/35 px-2.5 py-3 text-[12.5px]">Your chats will show up here.</p>
          ) : null}
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div className="border-fg/8 flex flex-col gap-0.5 border-t px-2 pt-2">
        {secondaryNav.map(({ label, href, icon }) => (
          <RailButton
            key={href}
            href={href}
            label={label}
            icon={icon}
            collapsed={collapsed}
            active={pathname === href}
          />
        ))}
      </div>

      {/* Extra bottom padding keeps the account chip clear of Next's dev badge. */}
      <div className="p-2 pb-4">
        <AccountMenu
          name={displayName(me)}
          avatarUrl={me?.avatar_url}
          plan="Free plan"
          collapsed={collapsed}
          onShowShortcuts={onShowShortcuts}
        />
      </div>
    </aside>
  );
}

function RailButton({
  href,
  label,
  icon: Icon,
  collapsed,
  active,
  onClick,
  hint,
}: {
  href?: string;
  label: string;
  icon: (props: { size?: number; className?: string }) => React.ReactNode;
  collapsed: boolean;
  active?: boolean;
  onClick?: () => void;
  hint?: string;
}) {
  const className = cn(
    "flex h-9 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
    active ? "bg-fg/10 text-fg" : "text-fg/60 hover:bg-fg/6 hover:text-fg"
  );
  const body = (
    <>
      <Icon size={18} className="shrink-0" />
      {!collapsed ? <span className="flex-1 truncate text-left">{label}</span> : null}
      {!collapsed && hint ? <kbd className="text-fg/30 text-[11px]">{hint}</kbd> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : undefined}
        className={className}
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={className}
    >
      {body}
    </button>
  );
}

function ChatGroup({
  label,
  entries,
  pathname,
}: {
  label: string;
  entries: HistoryEntry[];
  pathname: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-fg/35 px-2.5 pt-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <ChatRow key={entry.id} entry={entry} active={pathname === `/thread/${entry.id}`} />
        ))}
      </ul>
    </div>
  );
}

function ChatRow({ entry, active }: { entry: HistoryEntry; active: boolean }) {
  const router = useRouter();
  const update = useUpdateChat();
  const remove = useDeleteChat();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function saveRename() {
    setRenaming(false);
    const title = draft.trim();
    if (title && title !== entry.title) update.mutate({ id: entry.id, title });
  }

  return (
    <li className="group relative">
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveRename();
            if (event.key === "Escape") setRenaming(false);
          }}
          className="vd-glass-control text-fg h-9 w-full rounded-lg px-2.5 text-[13.5px] outline-none"
        />
      ) : (
        <Link
          href={`/thread/${entry.id}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex h-9 items-center rounded-lg px-2.5 pr-16 text-[13.5px] transition-colors",
            active ? "bg-fg/10 text-fg" : "text-fg/65 hover:bg-fg/6 hover:text-fg"
          )}
        >
          <span className="truncate">{entry.title}</span>
        </Link>
      )}

      {!renaming ? (
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <RowAction
            label={entry.pinned ? "Unpin" : "Pin"}
            onClick={() => update.mutate({ id: entry.id, pinned: !entry.pinned })}
          >
            <span className="text-[13px]">{entry.pinned ? "★" : "☆"}</span>
          </RowAction>
          <RowAction
            label="Rename"
            onClick={() => {
              setDraft(entry.title);
              setRenaming(true);
            }}
          >
            <PencilIcon size={13} />
          </RowAction>
          <RowAction label="Delete" onClick={() => setConfirmDelete(true)}>
            <TrashIcon size={13} />
          </RowAction>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this chat?"
        description="The conversation and its files are removed. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          remove.mutate(entry.id, {
            onSuccess: () => {
              if (active) router.push("/");
            },
          });
        }}
      />
    </li>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
      className="text-fg/45 hover:bg-fg/10 hover:text-fg grid size-6 cursor-pointer place-items-center rounded-md"
    >
      {children}
    </button>
  );
}
