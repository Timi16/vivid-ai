import { z } from "zod";

// Mirrors GET /v1/health in vivid-backend.
export const healthSchema = z.object({
  status: z.string(),
  app: z.string().optional(),
  version: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

export type Health = z.infer<typeof healthSchema>;
