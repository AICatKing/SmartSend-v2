import { loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

loadEnvFiles(import.meta.url);

const localAsyncShimEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    HOST: z.string().default("0.0.0.0"),
    LOCAL_ASYNC_SHIM_PORT: z.coerce.number().int().positive().optional(),
    WORKER_PORT: z.coerce.number().int().positive().optional(),
    DATABASE_URL: z.string().min(1).optional(),
  })
  .transform((env) => ({
    NODE_ENV: env.NODE_ENV,
    LOG_LEVEL: env.LOG_LEVEL,
    HOST: env.HOST,
    PORT: env.LOCAL_ASYNC_SHIM_PORT ?? env.WORKER_PORT ?? 3001,
    DATABASE_URL: env.DATABASE_URL,
  }));

export const localAsyncShimEnv = parseEnv(localAsyncShimEnvSchema);
