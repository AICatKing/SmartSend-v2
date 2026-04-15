import { spawnSync } from "node:child_process";

import postgres from "postgres";
import { loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

loadEnvFiles(import.meta.url);

const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1).optional(),
    TEST_DATABASE_URL: z.string().min(1),
  }),
);

async function main() {
  const testUrl = new URL(env.TEST_DATABASE_URL);
  const developmentUrl = env.DATABASE_URL ? new URL(env.DATABASE_URL) : null;
  const testDatabaseName = testUrl.pathname.replace(/^\//, "");

  if (!testDatabaseName) {
    throw new Error("TEST_DATABASE_URL must include a database name.");
  }

  if (!/^[a-zA-Z0-9_]+$/.test(testDatabaseName)) {
    throw new Error(
      "TEST_DATABASE_URL database name must contain only letters, numbers, or underscores.",
    );
  }

  if (testDatabaseName === "postgres") {
    throw new Error("Refusing to reset the postgres maintenance database.");
  }

  if (
    developmentUrl &&
    developmentUrl.pathname.replace(/^\//, "") === testDatabaseName
  ) {
    throw new Error(
      "TEST_DATABASE_URL must not point to the same database name as DATABASE_URL.",
    );
  }

  const adminUrl = new URL(env.TEST_DATABASE_URL);
  adminUrl.pathname = "/postgres";

  const sql = postgres(adminUrl.toString(), {
    prepare: false,
  });

  try {
    console.log(`Resetting test database "${testDatabaseName}"...`);

    await sql`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${testDatabaseName}
        and pid <> pg_backend_pid()
    `;

    await sql.unsafe(`drop database if exists "${testDatabaseName}"`);
    await sql.unsafe(`create database "${testDatabaseName}"`);
  } finally {
    await sql.end();
  }

  console.log(`Running migrations against "${testDatabaseName}"...`);

  const migrate = spawnSync("npm", ["run", "db:migrate", "--workspace", "@smartsend/db"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: env.TEST_DATABASE_URL,
    },
    stdio: "inherit",
  });

  if (migrate.status !== 0) {
    throw new Error(`db:migrate failed with exit code ${migrate.status ?? "unknown"}.`);
  }

  console.log(`Test database "${testDatabaseName}" is ready.`);
}

void main();
