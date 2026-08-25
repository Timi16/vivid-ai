import type { ActivityItem } from "@/lib/activity";

// Groups by when it happened, the way a person scans a notifications list:
// "the one from earlier today", not an exact time.
export function groupByDay(
  items: ActivityItem[],
  now: Date = new Date()
): { label: string; items: ActivityItem[] }[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const buckets: Record<string, ActivityItem[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    if (item.at >= startOfToday.getTime()) buckets.Today.push(item);
    else if (item.at >= startOfToday.getTime() - dayMs) buckets.Yesterday.push(item);
    else buckets.Earlier.push(item);
  }
  return Object.entries(buckets)
    .filter(([, group]) => group.length > 0)
    .map(([label, group]) => ({ label, items: group }));
}
