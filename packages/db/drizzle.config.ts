import { defineConfig } from "drizzle-kit";
import { loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

loadEnvFiles(import.meta.url);

const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
  }),
);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
