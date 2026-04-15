import { loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

loadEnvFiles(import.meta.url);

export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  AUTH_MODE: z.enum(["dev_headers", "better_auth"]).default("better_auth"),
  AUTH_SESSION_COOKIE_NAME: z.string().min(1).default("smartsend_session"),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).optional(),
  API_ENCRYPTION_KEY: z.string().min(32).optional(),
});

export const apiEnv = parseEnv(apiEnvSchema);
