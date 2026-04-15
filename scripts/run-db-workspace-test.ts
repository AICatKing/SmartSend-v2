import { spawnSync } from "node:child_process";

const workspace = process.argv[2];

if (!workspace) {
  throw new Error("Workspace argument is required.");
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required.");
}

const result = spawnSync("npm", ["test", "--workspace", workspace], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
  },
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
