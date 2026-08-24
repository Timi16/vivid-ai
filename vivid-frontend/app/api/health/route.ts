import { healthSchema } from "@/lib/api/schemas/health";
import { proxy } from "@/lib/server/upstream";

// Proxies the backend's health check. This is the template every other route
// handler follows: name the upstream path, name the schema, return the proxy.
export async function GET() {
  return proxy("/v1/health", healthSchema);
}
