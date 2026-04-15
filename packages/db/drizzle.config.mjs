import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "../..");
const envFile = path.join(rootDir, ".env");
const localEnvFile = path.join(rootDir, ".env.local");

if (existsSync(envFile)) {
  dotenv.config({ path: envFile, override: false });
}

if (existsSync(localEnvFile)) {
  dotenv.config({ path: localEnvFile, override: false });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run drizzle-kit.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./.drizzle-build/schema",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
