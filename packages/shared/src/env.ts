import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

import { ConfigError } from "./errors.js";

let hasLoadedEnv = false;

export function loadEnvFiles(from: string = process.cwd()) {
  if (hasLoadedEnv) {
    return;
  }

  const startDir = toDirectory(from);
  const rootDir = findRepoRoot(startDir);

  if (!rootDir) {
    hasLoadedEnv = true;
    return;
  }

  const envFile = join(rootDir, ".env");
  const localEnvFile = join(rootDir, ".env.local");

  if (existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }

  if (existsSync(localEnvFile)) {
    dotenv.config({ path: localEnvFile, override: true });
  }

  hasLoadedEnv = true;
}

export function parseEnv<TSchema extends z.ZodTypeAny>(schema: TSchema): z.infer<TSchema> {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    throw new ConfigError("Environment validation failed.", {
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

function toDirectory(from: string) {
  if (from.startsWith("file://")) {
    return dirname(fileURLToPath(from));
  }

  return resolve(from);
}

function findRepoRoot(startDir: string) {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = join(currentDir, "package.json");
    const gitPath = join(currentDir, ".git");

    if (existsSync(packageJsonPath) && existsSync(gitPath)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return null;
    }

    currentDir = parentDir;
  }
}
