import { loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

import { checkDatabaseConnection } from "../client.js";

loadEnvFiles(import.meta.url);

const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
  }),
);

async function main() {
  await checkDatabaseConnection(env.DATABASE_URL);
  console.log("Database connection OK");
}

void main();
