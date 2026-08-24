import { QueryClient } from "@tanstack/react-query";

// One client for the app. Retries are off by default: the backend client
// already normalises network failures into one message, and a chat app
// retrying silently just delays telling the user the connection is gone.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
}
