import { AppError } from "@smartsend/shared";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  campaigns,
  deliveryAttempts,
  sendJobs,
  workspaceSendingConfigs,
  type Database,
} from "@smartsend/db";
import {
  claimSendJobInputSchema,
  deliveryAttemptSchema,
  processSendJobInputSchema,
  sendJobProcessingResultSchema,
} from "@smartsend/contracts";

import type {
  ProviderAdapter,
  ProviderSendFailure,
  ProviderSendInput,
  ProviderSendResult,
} from "./provider-adapter.js";

type ClaimedSendJob = typeof sendJobs.$inferSelect;

export async function claimSendJobForProcessing(db: Database, input: unknown) {
  const parsed = claimSendJobInputSchema.parse(input);

  const result = await db.execute(sql`
    with candidate as (
      select id
      from send_jobs
      where status = 'pending'
        and scheduled_at <= now()
        and locked_at is null
        ${parsed.workspaceId ? sql`and workspace_id = ${parsed.workspaceId}` : sql``}
      order by scheduled_at asc, created_at asc
      limit 1
      for update skip locked
    )
    update send_jobs
    set
      status = 'processing',
      locked_at = now(),
      locked_by = ${parsed.lockedBy},
      updated_at = now()
    where id in (select id from candidate)
    returning *;
  `);

  const rows = extractRows<ClaimedSendJob>(result);

  return rows[0] ?? null;
}

type ProcessSendJobInput = {
  lockedBy: string;
  providerAdapter: ProviderAdapter;
  sendJobId: string;
};

export async function processSendJob(db: Database, input: ProcessSendJobInput) {
  const parsed = processSendJobInputSchema.parse(input);
  const requestedAt = new Date();

  const result = await db.transaction(async (tx) => {
    const [sendJob] = await tx
      .select()
      .from(sendJobs)
      .where(
        and(
          eq(sendJobs.id, parsed.sendJobId),
          eq(sendJobs.status, "processing"),
          eq(sendJobs.lockedBy, parsed.lockedBy),
          isNull(sendJobs.processedAt),
        ),
      )
      .limit(1);

    if (!sendJob) {
      throw new AppError(
        "NOT_FOUND",
        "Send job is not claimable for processing by this worker.",
      );
    }

    const [workspaceConfig] = await tx
      .select()
      .from(workspaceSendingConfigs)
      .where(eq(workspaceSendingConfigs.workspaceId, sendJob.workspaceId))
      .limit(1);

    if (!workspaceConfig) {
      const completedAt = new Date();
      const attempt = await recordDeliveryAttempt(tx as unknown as Database, {
        workspaceId: sendJob.workspaceId,
        sendJobId: sendJob.id,
        provider: sendJob.provider,
        providerMessageId: null,
        status: "failed",
        errorCode: "MISSING_WORKSPACE_SENDING_CONFIG",
        errorMessage: "Workspace sending config is missing.",
        requestPayloadJson: {},
        responsePayloadJson: {},
        requestedAt,
        completedAt,
      });

      await markSendJobFailed(tx as unknown as Database, {
        sendJob,
        errorCode: "MISSING_WORKSPACE_SENDING_CONFIG",
        errorMessage: "Workspace sending config is missing.",
        completedAt,
      });

      const campaignStatus = await refreshCampaignStatus(
        tx as unknown as Database,
        sendJob.workspaceId,
        sendJob.campaignId,
      );

      return sendJobProcessingResultSchema.parse({
        sendJobId: sendJob.id,
        workspaceId: sendJob.workspaceId,
        campaignId: sendJob.campaignId,
        finalStatus: "failed",
        classification: "non_retryable",
        deliveryAttemptId: attempt.id,
        campaignStatus,
      });
    }

    const providerInput: ProviderSendInput = {
      encryptedApiKey: workspaceConfig.encryptedApiKey,
      workspaceId: sendJob.workspaceId,
      provider: workspaceConfig.provider,
      fromEmail: workspaceConfig.fromEmail,
      fromName: workspaceConfig.fromName,
      replyToEmail: workspaceConfig.replyToEmail,
      recipientEmail: sendJob.recipientEmail,
      recipientName: sendJob.recipientName,
      subject: sendJob.renderedSubject,
      html: sendJob.renderedBody,
    };

    const providerResult = await input.providerAdapter.send(providerInput);
    const completedAt = new Date();

    const attempt = await recordDeliveryAttempt(tx as unknown as Database, {
      workspaceId: sendJob.workspaceId,
      sendJobId: sendJob.id,
      provider: providerResult.provider,
      providerMessageId: providerResult.ok
        ? providerResult.providerMessageId ?? null
        : null,
      status: providerResult.ok ? "sent" : "failed",
      errorCode: providerResult.ok ? null : providerResult.errorCode ?? null,
      errorMessage: providerResult.ok ? null : providerResult.errorMessage ?? null,
      requestPayloadJson: toRequestPayload(providerInput),
      responsePayloadJson:
        providerResult.responsePayloadJson ?? toDefaultResponsePayload(providerResult),
      requestedAt,
      completedAt,
    });

    if (providerResult.ok) {
      await markSendJobSent(tx as unknown as Database, {
        sendJob,
        completedAt,
        providerMessageId: providerResult.providerMessageId ?? null,
      });
      await refreshCampaignStatus(
        tx as unknown as Database,
        sendJob.workspaceId,
        sendJob.campaignId,
      );

      return sendJobProcessingResultSchema.parse({
        sendJobId: sendJob.id,
        workspaceId: sendJob.workspaceId,
        campaignId: sendJob.campaignId,
        finalStatus: "sent",
        deliveryAttemptId: attempt.id,
      });
    }

    const finalStatus = await handleFailedSendResult(
      tx as unknown as Database,
      sendJob,
      providerResult,
      completedAt,
    );
    await refreshCampaignStatus(
      tx as unknown as Database,
      sendJob.workspaceId,
      sendJob.campaignId,
    );

    return sendJobProcessingResultSchema.parse({
      sendJobId: sendJob.id,
      workspaceId: sendJob.workspaceId,
      campaignId: sendJob.campaignId,
      finalStatus,
      classification: providerResult.classification,
      deliveryAttemptId: attempt.id,
    });
  });

  return result;
}

type RecordDeliveryAttemptInput = {
  workspaceId: string;
  sendJobId: string;
  provider: typeof deliveryAttempts.$inferInsert.provider;
  providerMessageId: string | null;
  status: typeof deliveryAttempts.$inferInsert.status;
  errorCode: string | null;
  errorMessage: string | null;
  requestPayloadJson: Record<string, unknown>;
  responsePayloadJson: Record<string, unknown>;
  requestedAt: Date;
  completedAt: Date;
};

export async function recordDeliveryAttempt(
  db: Database,
  input: RecordDeliveryAttemptInput,
) {
  const [inserted] = await db
    .insert(deliveryAttempts)
    .values({
      id: `attempt_${crypto.randomUUID()}`,
      workspaceId: input.workspaceId,
      sendJobId: input.sendJobId,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      status: input.status,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      requestPayloadJson: input.requestPayloadJson,
      responsePayloadJson: input.responsePayloadJson,
      requestedAt: input.requestedAt,
      completedAt: input.completedAt,
    })
    .returning();

  const attempt = assertFound(inserted);

  return deliveryAttemptSchema.parse({
    id: attempt.id,
    workspaceId: attempt.workspaceId,
    sendJobId: attempt.sendJobId,
    provider: attempt.provider,
    providerMessageId: attempt.providerMessageId ?? null,
    status: attempt.status,
    errorCode: attempt.errorCode ?? null,
    errorMessage: attempt.errorMessage ?? null,
    requestPayloadJson: attempt.requestPayloadJson,
    responsePayloadJson: attempt.responsePayloadJson,
    requestedAt: attempt.requestedAt.toISOString(),
    completedAt: attempt.completedAt.toISOString(),
  });
}

type MarkSendJobSentInput = {
  sendJob: ClaimedSendJob;
  completedAt: Date;
  providerMessageId: string | null;
};

export async function markSendJobSent(db: Database, input: MarkSendJobSentInput) {
  await db
    .update(sendJobs)
    .set({
      status: "sent",
      attemptCount: input.sendJob.attemptCount + 1,
      processedAt: input.completedAt,
      lockedAt: null,
      lockedBy: null,
      providerMessageId: input.providerMessageId,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(sendJobs.id, input.sendJob.id));
}

type MarkSendJobFailedInput = {
  sendJob: ClaimedSendJob;
  completedAt: Date;
  errorCode: string;
  errorMessage: string;
};

export async function markSendJobFailed(
  db: Database,
  input: MarkSendJobFailedInput,
) {
  await db
    .update(sendJobs)
    .set({
      status: "failed",
      attemptCount: input.sendJob.attemptCount + 1,
      processedAt: input.completedAt,
      lockedAt: null,
      lockedBy: null,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(sendJobs.id, input.sendJob.id));
}

type RequeueSendJobInput = {
  sendJob: ClaimedSendJob;
  errorCode: string;
  errorMessage: string;
  scheduledAt: Date;
};

export async function requeueSendJob(db: Database, input: RequeueSendJobInput) {
  await db
    .update(sendJobs)
    .set({
      status: "pending",
      attemptCount: input.sendJob.attemptCount + 1,
      scheduledAt: input.scheduledAt,
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(sendJobs.id, input.sendJob.id));
}

export async function refreshCampaignStatus(
  db: Database,
  workspaceId: string,
  campaignId: string,
) {
  const rows = await db
    .select({
      status: sendJobs.status,
      total: count(),
    })
    .from(sendJobs)
    .where(and(eq(sendJobs.workspaceId, workspaceId), eq(sendJobs.campaignId, campaignId)))
    .groupBy(sendJobs.status);

  const grouped = new Map(rows.map((row) => [row.status, row.total]));
  const total = rows.reduce((acc, row) => acc + row.total, 0);

  const processing = grouped.get("processing") ?? 0;
  const pending = grouped.get("pending") ?? 0;
  const sent = grouped.get("sent") ?? 0;
  const failed = grouped.get("failed") ?? 0;
  const cancelled = grouped.get("cancelled") ?? 0;
  const terminal = sent + failed + cancelled;

  let nextStatus: "queued" | "processing" | "completed" | "failed" = "queued";

  if (processing > 0) {
    nextStatus = "processing";
  } else if (total > 0 && sent === total) {
    nextStatus = "completed";
  } else if (total > 0 && pending > 0) {
    nextStatus = "queued";
  } else if (total > 0 && terminal === total && failed > 0) {
    nextStatus = "failed";
  } else if (total > 0 && terminal === total) {
    nextStatus = "failed";
  }

  await db
    .update(campaigns)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.workspaceId, workspaceId)));

  return nextStatus;
}

async function handleFailedSendResult(
  db: Database,
  sendJob: ClaimedSendJob,
  failure: ProviderSendFailure,
  completedAt: Date,
): Promise<"pending" | "failed"> {
  const errorCode = failure.errorCode ?? "PROVIDER_ERROR";
  const errorMessage = failure.errorMessage ?? "Provider send failed.";

  if (failure.classification === "non_retryable") {
    await markSendJobFailed(db, {
      sendJob,
      completedAt,
      errorCode,
      errorMessage,
    });
    return "failed";
  }

  const nextAttemptCount = sendJob.attemptCount + 1;
  if (nextAttemptCount >= sendJob.maxAttempts) {
    await markSendJobFailed(db, {
      sendJob,
      completedAt,
      errorCode,
      errorMessage,
    });
    return "failed";
  }

  await requeueSendJob(db, {
    sendJob,
    errorCode,
    errorMessage,
    scheduledAt: new Date(),
  });
  return "pending";
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }

  return [];
}

function toRequestPayload(input: ProviderSendInput) {
  return {
    fromEmail: input.fromEmail,
    fromName: input.fromName,
    provider: input.provider,
    replyToEmail: input.replyToEmail ?? null,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
  };
}

function toDefaultResponsePayload(result: ProviderSendResult): Record<string, unknown> {
  if (result.ok) {
    return {
      ok: true,
      provider: result.provider,
      providerMessageId: result.providerMessageId ?? null,
    };
  }

  return {
    ok: false,
    provider: result.provider,
    classification: result.classification,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
  };
}

function assertFound<T>(value: T | undefined): T {
  if (!value) {
    throw new AppError("DEPENDENCY_ERROR", "Expected record not returned from database.");
  }

  return value;
}
