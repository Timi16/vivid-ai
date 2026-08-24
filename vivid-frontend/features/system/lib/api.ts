import { createServiceClient } from "@/lib/api/service";
import type { Health } from "@/lib/api/schemas/health";

// Points at this app's own route handlers, never at the backend directly.
const client = createServiceClient("/api", "Couldn't reach the backend.");

export function fetchHealth(): Promise<Health> {
  return client.get<Health>("/health");
}
