import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema/index.js";

export type DatabaseClient = ReturnType<typeof postgres>;
export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
  });

  const db = drizzle(client, {
    schema,
  });

  return {
    client,
    db,
  };
}

export async function checkDatabaseConnection(connectionString: string) {
  const { client, db } = createDatabase(connectionString);

  try {
    await db.execute(sql`select 1 as result`);
  } finally {
    await client.end();
  }
}
