import { z } from "zod";
import { asyncServiceIdSchema } from "./primitives.js";

export const healthDatabaseSchema = z.object({
  status: z.enum(["up", "down"]),
  details: z.string().optional(),
});

export const healthResponseSchema = z.object({
  service: asyncServiceIdSchema,
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime(),
  version: z.string(),
  database: healthDatabaseSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
