"use client";

import { useState } from "react";
import Link from "next/link";

import { AsyncError, AsyncLoading } from "@/components/ui/async-state";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { useArtifacts } from "@/features/artifacts/hooks/use-artifacts";
import type { ArtifactOut } from "@/lib/backend/client";
import { relativeTime } from "@/lib/format";

type Filter = "all" | "file" | "image";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "file", label: "Documents" },
  { value: "image", label: "Images" },
];

function iconFor(artifact: ArtifactOut): string {
  if (artifact.mime === "application/pdf") return "📕";
  if (artifact.mime.startsWith("text/csv")) return "📊";
  if (artifact.mime.startsWith("image/")) return "🖼";
  return "📄";
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Everything Vivid has made for the user across chats, with a way back to
// the conversation each one came from.
export function GeneratedFilesView() {
  const { data, isPending, isError, error, refetch } = useArtifacts();
  const [filter, setFilter] = useState<Filter>("all");

  const shown = (data ?? []).filter((item) => filter === "all" || item.kind === filter);

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 py-8">
      <PageHeader
        title="Artifacts"
        description="Files and images Vivid has generated for you, across every chat."
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} className="mt-6">
        <TabsList>
          {FILTERS.map((option) => (
            <TabsTab key={option.value} value={option.value}>
              {option.label}
            </TabsTab>
          ))}
          <TabsIndicator />
        </TabsList>
        <TabsPanel value={filter} className="mt-6">
          {isPending ? <AsyncLoading label="Loading your artifacts" rows={3} /> : null}
          {isError ? (
            <AsyncError error={error} subject="your artifacts" onRetry={() => refetch()} />
          ) : null}
          {data && shown.length === 0 ? (
            <p className="text-fg/45 py-10 text-center text-[13.5px]">
              Nothing here yet. Ask Vivid to convert a file, make a chart, or export a CSV and
              it will show up here.
            </p>
          ) : null}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => (
              <li key={item.id} className="vd-glass-card flex flex-col gap-3 p-4">
                {item.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt={item.filename ?? ""} className="h-36 w-full rounded-lg object-cover" />
                ) : (
                  <div className="bg-fg/5 grid h-36 place-items-center rounded-lg text-4xl">
                    {iconFor(item)}
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fg/90 hover:text-fg truncate text-[13.5px] font-semibold"
                  >
                    {item.filename ?? "file"}
                  </a>
                  <span className="text-fg/40 text-[11.5px]">
                    {sizeLabel(item.size_bytes)} · {relativeTime(new Date(item.created_at))}
                  </span>
                  <Link
                    href={`/thread/${item.chat_id}`}
                    className="text-fg/50 hover:text-fg truncate text-[11.5px]"
                  >
                    From: {item.chat_title ?? "a chat"}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
