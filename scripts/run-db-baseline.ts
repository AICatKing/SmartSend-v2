import { spawnSync } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required.");
}

const steps: Array<{ command: string[]; label: string }> = [
  {
    command: ["run", "db:test:prepare"],
    label: "prepare test database",
  },
  {
    command: ["run", "test:api:db"],
    label: "run API integration tests",
  },
  {
    command: ["run", "test:worker:db"],
    label: "run worker integration tests",
  },
];

for (const step of steps) {
  console.log(`\n==> ${step.label}`);

  const stepEnv =
    step.command[1] === "db:test:prepare"
      ? {
          ...process.env,
          TEST_DATABASE_URL: testDatabaseUrl,
        }
      : {
          ...process.env,
          TEST_DATABASE_URL: testDatabaseUrl,
          DATABASE_URL: testDatabaseUrl,
        };

  const result = spawnSync("npm", step.command, {
    cwd: process.cwd(),
    env: stepEnv,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
