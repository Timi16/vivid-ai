"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { backend, getTokens, type UserOut } from "@/lib/backend/client";

export const meQueryKey = ["me"] as const;

/** The signed-in account's profile: name, avatar, and the address to show. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => backend.me(),
    enabled: Boolean(getTokens()),
    staleTime: 5 * 60_000,
  });
}

/** What to call this person: their name, else the address they signed in with. */
export function displayName(user: UserOut | undefined): string {
  if (!user) return "Guest";
  return user.name || user.profile_email || user.email;
}

/** The address worth showing — the real one for social sign-ins, not the key. */
export function displayEmail(user: UserOut | undefined): string {
  if (!user) return "";
  return user.profile_email || user.email;
}

export function useUpdateName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => backend.updateMe(name),
    onSuccess: (user) => queryClient.setQueryData(meQueryKey, user),
  });
}
