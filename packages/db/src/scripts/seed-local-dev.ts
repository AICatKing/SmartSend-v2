import { eq } from "drizzle-orm";
import { createSecretBox, loadEnvFiles, parseEnv } from "@smartsend/shared";
import { z } from "zod";

import { createDatabase } from "../client.js";
import {
  users,
  workspaceMembers,
  workspaceSendingConfigs,
  workspaces,
} from "../schema/index.js";

const explicitDatabaseUrl = process.env.DATABASE_URL;
const explicitEncryptionKey = process.env.API_ENCRYPTION_KEY;

loadEnvFiles(import.meta.url);

if (explicitDatabaseUrl) {
  process.env.DATABASE_URL = explicitDatabaseUrl;
}

if (explicitEncryptionKey) {
  process.env.API_ENCRYPTION_KEY = explicitEncryptionKey;
}

const env = parseEnv(
  z.object({
    DATABASE_URL: z.string().min(1),
    API_ENCRYPTION_KEY: z.string().min(32),
  }),
);

const localSeed = {
  user: {
    id: "user_local_owner",
    email: "local-owner@example.com",
    name: "Local Owner",
  },
  workspace: {
    id: "ws_local_demo",
    name: "Local Demo Workspace",
  },
  membership: {
    role: "owner" as const,
  },
  sendingConfig: {
    provider: "resend" as const,
    fromEmail: "sender@example.com",
    fromName: "Local Sender",
    replyToEmail: "reply@example.com",
    apiKey: "local-dev-provider-key",
  },
};

async function main() {
  const { client, db } = createDatabase(env.DATABASE_URL);
  const secretBox = createSecretBox(env.API_ENCRYPTION_KEY);
  const encryptedApiKey = secretBox.encrypt(localSeed.sendingConfig.apiKey);

  try {
    const currentDatabase = await db.execute<{ current_database: string }>(
      "select current_database()",
    );

    await db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: localSeed.user.id,
          email: localSeed.user.email,
          name: localSeed.user.name,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: localSeed.user.email,
            name: localSeed.user.name,
            updatedAt: new Date(),
          },
        });

      await tx
        .insert(workspaces)
        .values({
          id: localSeed.workspace.id,
          name: localSeed.workspace.name,
        })
        .onConflictDoUpdate({
          target: workspaces.id,
          set: {
            name: localSeed.workspace.name,
            updatedAt: new Date(),
          },
        });

      await tx
        .insert(workspaceMembers)
        .values({
          workspaceId: localSeed.workspace.id,
          userId: localSeed.user.id,
          role: localSeed.membership.role,
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: {
            role: localSeed.membership.role,
            updatedAt: new Date(),
          },
        });

      const existingConfig = await tx.query.workspaceSendingConfigs.findFirst({
        where: eq(workspaceSendingConfigs.workspaceId, localSeed.workspace.id),
      });

      if (existingConfig) {
        await tx
          .update(workspaceSendingConfigs)
          .set({
            provider: localSeed.sendingConfig.provider,
            fromEmail: localSeed.sendingConfig.fromEmail,
            fromName: localSeed.sendingConfig.fromName,
            replyToEmail: localSeed.sendingConfig.replyToEmail,
            encryptedApiKey,
            updatedAt: new Date(),
          })
          .where(eq(workspaceSendingConfigs.workspaceId, localSeed.workspace.id));
      } else {
        await tx.insert(workspaceSendingConfigs).values({
          workspaceId: localSeed.workspace.id,
          provider: localSeed.sendingConfig.provider,
          fromEmail: localSeed.sendingConfig.fromEmail,
          fromName: localSeed.sendingConfig.fromName,
          replyToEmail: localSeed.sendingConfig.replyToEmail,
          encryptedApiKey,
        });
      }
    });

    console.log("Local development seed is ready.");
    console.log(`Database: ${extractCurrentDatabase(currentDatabase)}`);
    console.log(`User ID: ${localSeed.user.id}`);
    console.log(`Workspace ID: ${localSeed.workspace.id}`);
    console.log("Workspace role: owner");
    console.log("Workspace sending config: upserted");
  } finally {
    await client.end();
  }
}

void main();

function extractCurrentDatabase(
  result: unknown,
) {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object") {
    const value = (result[0] as { current_database?: unknown }).current_database;
    if (typeof value === "string") {
      return value;
    }
  }

  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
      const value = (rows[0] as { current_database?: unknown }).current_database;
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return "unknown";
}
