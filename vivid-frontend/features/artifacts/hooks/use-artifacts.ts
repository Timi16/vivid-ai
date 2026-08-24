"use client";

import { useQuery } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";

export const artifactsQueryKey = ["artifacts"] as const;

// Files Vivid generated for this user, newest first.
export function useArtifacts() {
  return useQuery({
    queryKey: artifactsQueryKey,
    queryFn: () => backend.artifacts(),
    staleTime: 30_000,
  });
}
