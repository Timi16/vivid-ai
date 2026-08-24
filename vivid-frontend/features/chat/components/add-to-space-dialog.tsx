"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { CheckIcon, FolderPlusIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface AddToSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Spaces to choose from. The route owns them, so this feature does not need
  // to know how spaces are loaded.
  spaces: { id: string; name: string; count: number }[];
}

export function AddToSpaceDialog({ open, onOpenChange, spaces }: AddToSpaceDialogProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = spaces.filter((space) =>
    space.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setSelected(null);
        }
      }}
      title="Add to a space"
      description="Spaces group related threads so you can come back to them together."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selected}
            onClick={() => {
              const space = spaces.find((s) => s.id === selected);
              onOpenChange(false);
              setSelected(null);
              setQuery("");
              toast(`Added to ${space?.name ?? "the space"}`);
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon
            size={16}
            className="text-fg/35 pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2"
          />
          <Input
            placeholder="Find a space"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-10"
            aria-label="Find a space"
          />
        </div>

        <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-fg/45 px-1 py-6 text-center text-[12.5px] font-normal">
              No space matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            filtered.map((space) => {
              const on = selected === space.id;
              return (
                <button
                  key={space.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(space.id)}
                  className={cn(
                    "vd-glass-control vd-sheen flex cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3",
                    "hover:border-fg/28 text-left transition-colors",
                    on && "border-fg/45 bg-fg/14"
                  )}
                >
                  <FolderPlusIcon size={16} className="text-fg/45 shrink-0" />
                  <span className="text-fg/85 flex-1 truncate text-[13px] font-medium">
                    {space.name}
                  </span>
                  <span className="text-fg/40 shrink-0 text-[11.5px] font-normal">
                    {space.count}
                  </span>
                  {on ? <CheckIcon size={15} className="text-fg shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
