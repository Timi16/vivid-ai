import { useQuery } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";

export const healthQueryKey = ["system", "health"] as const;

// Polls the backend health check. Short stale time: the point of this is to
// notice quickly when the backend goes away during development.
export function useHealth() {
  return useQuery({
    queryKey: healthQueryKey,
    queryFn: backend.health,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}
