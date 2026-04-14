import { AppError } from "@smartsend/shared";
import { eq } from "drizzle-orm";
import {
  workspaceSendingConfigGetInputSchema,
  workspaceSendingConfigGetOutputSchema,
  workspaceSendingConfigSchema,
  workspaceSendingConfigUpsertOutputSchema,
} from "@smartsend/contracts";
import type { Database } from "@smartsend/db";
import { workspaceSendingConfigs } from "@smartsend/db";

type UpsertWorkspaceSendingConfigInput = {
  workspaceId: string;
  provider: "resend";
  fromEmail: string;
  fromName: string;
  replyToEmail?: string | null;
  encryptedApiKey?: string;
};

export async function getWorkspaceSendingConfig(db: Database, input: unknown) {
  const parsed = workspaceSendingConfigGetInputSchema.parse(input);

  const config = await db.query.workspaceSendingConfigs.findFirst({
    where: eq(workspaceSendingConfigs.workspaceId, parsed.workspaceId),
  });

  return workspaceSendingConfigGetOutputSchema.parse({
    config: config ? toWorkspaceSendingConfigDto(config) : null,
  });
}

export async function upsertWorkspaceSendingConfig(
  db: Database,
  input: UpsertWorkspaceSendingConfigInput,
) {
  const existing = await db.query.workspaceSendingConfigs.findFirst({
    where: eq(workspaceSendingConfigs.workspaceId, input.workspaceId),
  });

  const encryptedApiKey = input.encryptedApiKey ?? existing?.encryptedApiKey;

  if (!encryptedApiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "API key is required when creating workspace sending config.",
    );
  }

  const now = new Date();

  const [saved] = existing
    ? await db
        .update(workspaceSendingConfigs)
        .set({
          provider: input.provider,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyToEmail: input.replyToEmail ?? null,
          encryptedApiKey,
          updatedAt: now,
        })
        .where(eq(workspaceSendingConfigs.workspaceId, input.workspaceId))
        .returning()
    : await db
        .insert(workspaceSendingConfigs)
        .values({
          workspaceId: input.workspaceId,
          provider: input.provider,
          fromEmail: input.fromEmail,
          fromName: input.fromName,
          replyToEmail: input.replyToEmail ?? null,
          encryptedApiKey,
        })
        .returning();

  return workspaceSendingConfigUpsertOutputSchema.parse({
    config: toWorkspaceSendingConfigDto(assertFound(saved)),
  });
}

function toWorkspaceSendingConfigDto(
  record: typeof workspaceSendingConfigs.$inferSelect,
) {
  return workspaceSendingConfigSchema.parse({
    workspaceId: record.workspaceId,
    provider: record.provider,
    fromEmail: record.fromEmail,
    fromName: record.fromName,
    replyToEmail: record.replyToEmail,
    hasApiKey: Boolean(record.encryptedApiKey),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

function assertFound<T>(value: T | undefined): T {
  if (!value) {
    throw new AppError("DEPENDENCY_ERROR", "Database did not return the expected record.");
  }

  return value;
}
