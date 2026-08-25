import { groupByDay } from "@/features/notifications/lib/group";
import type { ActivityItem } from "@/lib/activity";

const now = new Date("2026-08-25T12:00:00");
const item = (id: string, at: string): ActivityItem => ({
  id,
  kind: "reply",
  title: id,
  detail: "",
  at: new Date(at).getTime(),
  unread: true,
});

describe("groupByDay", () => {
  it("buckets by today, yesterday and earlier, dropping empty groups", () => {
    const groups = groupByDay(
      [
        item("a", "2026-08-25T09:00:00"),
        item("b", "2026-08-24T23:30:00"),
        item("c", "2026-08-20T10:00:00"),
      ],
      now
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Earlier", ["c"]],
    ]);
  });

  it("returns nothing for an empty feed", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
