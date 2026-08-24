import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Glass } from "@/components/ui/glass";
import {
  ArtifactsIcon,
  CheckIcon,
  ComputerIcon,
  FilterIcon,
  ImageIcon,
  SearchIcon,
  TrashIcon,
  VideoIcon,
  type IconComponent,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { AppText } from "@/components/ui/text";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTheme } from "@/hooks/use-theme";
import { backend } from "@/lib/backend/client";
import { relativeTime } from "@/lib/format";
import { RADIUS } from "@/lib/theme";
import { toast } from "@/lib/toast";
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

const KIND_ICON: Record<ThreadKind, IconComponent> = {
  chat: ArtifactsIcon,
  image: ImageIcon,
  video: VideoIcon,
  computer: ComputerIcon,
};

export function HistoryView({ entries }: { entries: HistoryEntry[] }) {
  const { theme } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [order, setOrder] = useState<SortOrder>("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [kindMenu, setKindMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);

  // Debounced so a keystroke does not re-filter and re-group the whole list.
  const debounced = useDebouncedValue(query, 200);

  const groups = useMemo(
    () => groupByAge(sortEntries(filterByKind(searchEntries(entries, debounced), kind), order)),
    [entries, debounced, kind, order]
  );

  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const selecting = selected.length > 0;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  // Deletes go to the backend one by one; the list refetches afterwards so
  // it shows exactly what the server still has, including partial failures.
  async function deleteSelected() {
    const ids = selected;
    setDeleting(true);
    let failed = 0;
    for (const id of ids) {
      try {
        await backend.deleteChat(id);
      } catch {
        failed += 1;
      }
    }
    setDeleting(false);
    setDeleteOpen(false);
    setSelected([]);
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
    const deleted = ids.length - failed;
    if (failed) toast(`Deleted ${deleted} of ${ids.length}`, { description: "Some sessions could not be deleted." });
    else toast(deleted === 1 ? "Session deleted" : `${deleted} sessions deleted`);
  }

  return (
    <View>
      <PageHeader
        title="History"
        description="Everything you have asked, in one place."
        actions={
          selecting ? (
            <>
              <Button variant="ghost" size="sm" label="Cancel" onPress={() => setSelected([])} />
              <Button variant="danger" size="sm" label={`Delete ${selected.length}`} icon={<TrashIcon size={15} color="#ffb4b4" />} onPress={() => setDeleteOpen(true)} />
            </>
          ) : null
        }
      />

      <View style={{ marginTop: 24, gap: 10 }}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search your history"
          accessibilityLabel="Search your history"
          leading={<SearchIcon size={16} color={theme.fg(0.35)} />}
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip
            label={KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "All"}
            icon={<FilterIcon size={14} color={theme.fg(0.7)} />}
            onPress={() => setKindMenu(true)}
          />
          <Chip label={SORT_OPTIONS.find((o) => o.value === order)?.label ?? "Newest first"} onPress={() => setSortMenu(true)} />
        </View>
      </View>

      <Menu open={kindMenu} onOpenChange={setKindMenu}>
        <MenuLabel>Show</MenuLabel>
        {KIND_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            label={option.label}
            selected={kind === option.value}
            onPress={() => {
              setKind(option.value);
              setKindMenu(false);
            }}
          />
        ))}
      </Menu>
      <Menu open={sortMenu} onOpenChange={setSortMenu}>
        <MenuLabel>Sort by</MenuLabel>
        {SORT_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            label={option.label}
            selected={order === option.value}
            onPress={() => {
              setOrder(option.value);
              setSortMenu(false);
            }}
          />
        ))}
      </Menu>

      {total === 0 ? (
        <Glass tier="card" sheen style={{ marginTop: 24, alignItems: "center", paddingHorizontal: 20, paddingVertical: 56 }}>
          <View style={{ maxWidth: 320, gap: 6, alignItems: "center" }}>
            <AppText size={14} weight="semibold" tone={0.85}>
              Nothing matches that
            </AppText>
            <AppText size={12.5} weight="regular" tone={0.5} align="center">
              {debounced.trim()
                ? `No session matches "${debounced.trim()}". Try a different search or clear the filter.`
                : "Your sessions will show up here as you use Vivid."}
            </AppText>
          </View>
        </Glass>
      ) : (
        <View style={{ marginTop: 24, gap: 28 }}>
          {groups.map((group) => (
            <View key={group.label}>
              <AppText size={11.5} weight="semibold" tone={0.4} uppercase style={{ marginBottom: 10, letterSpacing: 0.6 }}>
                {group.label}
              </AppText>
              <View style={{ gap: 8 }}>
                {group.entries.map((entry) => {
                  const Icon = KIND_ICON[entry.kind];
                  const on = selected.includes(entry.id);
                  return (
                    <Glass key={entry.id} tier="card" sheen blur={false} active={on} radius={RADIUS.row} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`Select ${entry.title}`}
                        onPress={() => toggle(entry.id)}
                        hitSlop={6}
                      >
                        <View
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: on ? theme.colors.fg : theme.fg(0.08),
                          }}
                        >
                          {on ? <CheckIcon size={16} color={theme.colors.fgInvert} /> : <Icon size={16} color={theme.fg(0.7)} />}
                        </View>
                      </Pressable>

                      <Pressable
                        accessibilityRole="link"
                        onPress={() => (selecting ? toggle(entry.id) : router.push({ pathname: "/thread/[id]", params: { id: entry.id } }))}
                        style={{ flex: 1, gap: 2 }}
                      >
                        <AppText size={13.5} weight="semibold" numberOfLines={1}>
                          {entry.title}
                        </AppText>
                        {entry.preview ? (
                          <AppText size={12} weight="regular" tone={0.45} numberOfLines={1}>
                            {entry.preview}
                          </AppText>
                        ) : null}
                      </Pressable>

                      <AppText size={11.5} weight="regular" tone={0.35}>
                        {relativeTime(new Date(entry.updatedAt))}
                      </AppText>
                    </Glass>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="danger"
        title={selected.length === 1 ? "Delete this session?" : `Delete ${selected.length} sessions?`}
        description="They are removed from your history along with their answers. This can't be undone."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={() => void deleteSelected()}
      />
    </View>
  );
}
