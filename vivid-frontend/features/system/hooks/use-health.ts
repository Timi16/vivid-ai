"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "@/features/system/lib/api";

export const healthQueryKey = ["system", "health"] as const;

// Polls the backend health check. Short stale time: the point of this is to
// notice quickly when the backend goes away during development.
export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: fetchHealth,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
