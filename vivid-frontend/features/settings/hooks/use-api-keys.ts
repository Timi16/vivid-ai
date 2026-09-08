"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend } from "@/lib/backend/client";

export const apiKeysQueryKey = ["api-keys"] as const;

// This account's developer keys, newest first. Revoked ones stay in the list
// so "when did this key stop working" has an answer.
export function useApiKeys() {
  return useQuery({
    queryKey: apiKeysQueryKey,
    queryFn: () => backend.apiKeys(),
    staleTime: 30_000,
  });
}

// The secret is only in this response. The caller has to show it before it is
// gone, so the created key is returned rather than swallowed into the cache.
export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => backend.createApiKey(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backend.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: apiKeysQueryKey }),
  });
}
