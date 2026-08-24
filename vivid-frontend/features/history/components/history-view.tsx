"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import {
  ArtifactsIcon,
  CheckIcon,
  ComputerIcon,
  FilterIcon,
  ImageIcon,
  SearchIcon,
  TrashIcon,
  VideoIcon,
} from "@/components/ui/icons";
import { PageHeader } from "@/components/layout/page-header";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { HistoryEntry, ThreadKind } from "@/features/history/lib/data";
import {
  filterByKind,
  groupByAge,
  KIND_OPTIONS,
  searchEntries,
  SORT_OPTIONS,
  sortEntries,
  type KindFilter,
  type SortOrder,
} from "@/features/history/lib/filters";

const KIND_ICON: Record<ThreadKind, (props: { size?: number }) => React.ReactNode> = {
  chat: ArtifactsIcon,
  image: ImageIcon,
  video: VideoIcon,
  computer: ComputerIcon,
};

export function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [order, setOrder] = useState<SortOrder>("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);

  // Debounced so a keystroke does not re-filter and re-group the whole list.
  const debounced = useDebouncedValue(query, 200);

  const groups = useMemo(() => {
    const live = entries.filter((entry) => !removed.includes(entry.id));
    return groupByAge(sortEntries(filterByKind(searchEntries(live, debounced), kind), order));
  }, [entries, removed, debounced, kind, order]);

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const selecting = selected.length > 0;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-8">
      <PageHeader
        title="History"
        description="Everything you have asked, in one place."
        actions={
          selecting ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                <TrashIcon size={15} />
                Delete {selected.length}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <SearchIcon
            size={16}
            className="text-fg/35 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your history"
            aria-label="Search your history"
            className="pl-10"
          />
        </div>

        <Menu
          align="end"
          trigger={
            <Button variant="secondary" size="md">
              <FilterIcon size={15} />
              {KIND_OPTIONS.find((o) => o.value === kind)?.label}
            </Button>
          }
        >
          <MenuLabel>Show</MenuLabel>
          {KIND_OPTIONS.map((option) => (
            <MenuItem key={option.value} onClick={() => setKind(option.value)}>
              <span className="w-4">{kind === option.value ? <CheckIcon size={14} /> : null}</span>
              {option.label}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          align="end"
          trigger={
            <Button variant="secondary" size="md">
              {SORT_OPTIONS.find((o) => o.value === order)?.label}
            </Button>
          }
        >
          <MenuLabel>Sort by</MenuLabel>
          {SORT_OPTIONS.map((option) => (
            <MenuItem key={option.value} onClick={() => setOrder(option.value)}>
              <span className="w-4">{order === option.value ? <CheckIcon size={14} /> : null}</span>
              {option.label}
            </MenuItem>
          ))}
        </Menu>
      </div>

      {total === 0 ? (
        <div className="vd-glass-card vd-sheen mt-6 grid place-items-center px-5 py-16 text-center">
          <div className="max-w-[38ch]">
            <p className="text-fg/85 text-[14px] font-semibold">Nothing matches that</p>
            <p className="text-fg/50 mt-1.5 text-[12.5px] font-normal">
              {debounced.trim()
                ? `No session matches "${debounced.trim()}". Try a different search or clear the filter.`
                : "Your sessions will show up here as you use Vivid."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="text-fg/40 mb-2.5 text-[11.5px] font-semibold tracking-wide uppercase">
                {group.label}
              </h2>

              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => {
                  const Icon = KIND_ICON[entry.kind];
                  const on = selected.includes(entry.id);
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "vd-glass-card vd-sheen vd-glass-hover group flex items-center gap-3 rounded-[18px] p-3.5",
                        on && "border-fg/45 bg-fg/12"
                      )}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Select ${entry.title}`}
                        onClick={() => toggle(entry.id)}
                        className={cn(
                          "grid size-9 shrink-0 cursor-pointer place-items-center rounded-[12px] transition-colors",
                          on ? "bg-fg text-fg-invert" : "vd-glass-control text-fg/70"
                        )}
                      >
                        {on ? <CheckIcon size={16} /> : <Icon size={16} />}
                      </button>

                      <Link
                        href={`/thread/${entry.id}`}
                        className="flex min-w-0 flex-1 flex-col gap-0.5"
                      >
                        <span className="text-fg truncate text-[13.5px] font-semibold">
                          {entry.title}
                        </span>
                        <span className="text-fg/45 truncate text-[12px] font-normal">
                          {entry.preview}
                        </span>
                      </Link>

                      <div className="flex shrink-0 items-center gap-3">
                        {entry.space ? (
                          <span className="bg-fg/8 text-fg/50 hidden rounded-full px-2.5 py-1 text-[11px] font-medium sm:block">
                            {entry.space}
                          </span>
                        ) : null}
                        <span className="text-fg/35 text-[11.5px] font-normal">
                          {relativeTime(new Date(entry.updatedAt))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title={
          selected.length === 1 ? "Delete this session?" : `Delete ${selected.length} sessions?`
        }
        description="They are removed from your history along with their answers. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          const count = selected.length;
          setRemoved((prev) => [...prev, ...selected]);
          setSelected([]);
          setDeleteOpen(false);
          toast(count === 1 ? "Session deleted" : `${count} sessions deleted`);
        }}
      />
    </div>
  );
}
