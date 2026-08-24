"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, SpacesIcon } from "@/components/ui/icons";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import type { Space } from "@/features/spaces/lib/data";

export function SpacesView({ spaces }: { spaces: Space[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 py-8">
      <PageHeader
        title="Spaces"
        description="Group related threads so you can pick a subject back up where you left it."
        actions={
          <Button size="md" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={16} />
            New space
          </Button>
        }
      />

      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {spaces.map((space) => (
          <Card key={space.id} interactive className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <span className="vd-glass-control text-fg/70 grid size-9 shrink-0 place-items-center rounded-[12px]">
                <SpacesIcon size={17} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-fg truncate text-[14px] font-semibold">{space.name}</span>
                <span className="text-fg/45 text-[12px] font-normal">
                  {space.threadCount} threads · {relativeTime(new Date(space.updatedAt))}
                </span>
              </div>
            </div>
            <p className="text-fg/55 line-clamp-2 text-[12.5px] leading-relaxed font-normal">
              {space.description}
            </p>
          </Card>
        ))}
      </div>

      <Modal
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) {
            setName("");
            setDescription("");
            setError(null);
          }
        }}
        title="New space"
        description="Give it a name now; you can add threads to it at any time."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!name.trim()) {
                  setError("A space needs a name.");
                  return;
                }
                setCreateOpen(false);
                toast(`Created "${name.trim()}"`);
                setName("");
                setDescription("");
              }}
            >
              Create space
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field htmlFor="space-name" label="Name" required error={error ?? undefined}>
            <Input
              id="space-name"
              autoFocus
              placeholder="Optics and materials"
              value={name}
              invalid={Boolean(error)}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
            />
          </Field>

          <Field htmlFor="space-description" label="Description" hint="Optional.">
            <Textarea
              id="space-description"
              rows={3}
              placeholder="What belongs in this space?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
