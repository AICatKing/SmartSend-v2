import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  campaigns,
  createDatabase,
  deliveryAttempts,
  insertCampaignFixture,
  insertContactFixture,
  insertSendJobFixture,
  insertTemplateFixture,
  insertWorkspaceSendingConfigFixture,
  resetIntegrationTestDatabase,
  sendJobs,
  seedWorkspaceMembershipFixture,
  type Database,
} from "@smartsend/db";
import type { ProviderAdapter } from "@smartsend/domain";
import {
  claimSendJobForProcessing,
  processSendJob,
  recoverStuckProcessingSendJobs,
  recoveryFailedErrorCode,
  recoveryPendingErrorCode,
  sendJobRetryBaseDelayMs,
} from "@smartsend/domain";
import { AppError, createSecretBox } from "@smartsend/shared";

import { createLocalAsyncShimApp } from "./app.js";
import { createResendProviderAdapter } from "./provider/resend-adapter.js";
import { handleConsumerEvent, handleSendJobQueueMessage } from "./queue/consumer-handler.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);
const TEST_API_ENCRYPTION_KEY =
  process.env.API_ENCRYPTION_KEY ?? "smartsend-test-encryption-key-123456";

const integration = describe.skipIf(!hasDatabase);

integration("worker processing integration", () => {
  const dbBundle = createDatabase(DATABASE_URL ?? "postgres://invalid");
  const db = dbBundle.db;

  beforeAll(async () => {
    await db.execute(sql`select 1`);
  });

  afterAll(async () => {
    await dbBundle.client.end();
  });

  beforeEach(async () => {
    await resetIntegrationTestDatabase(db);
  });

  it("claims a pending send job only once across concurrent workers", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_claim_once",
    });

    const bundleA = createDatabase(DATABASE_URL ?? "postgres://invalid");
    const bundleB = createDatabase(DATABASE_URL ?? "postgres://invalid");

    try {
      const [claimA, claimB] = await Promise.all([
        claimSendJobForProcessing(bundleA.db, { lockedBy: "worker-a" }),
        claimSendJobForProcessing(bundleB.db, { lockedBy: "worker-b" }),
      ]);

      const claimed = [claimA, claimB].filter(
        (value): value is NonNullable<typeof value> => value !== null,
      );

      expect(claimed).toHaveLength(1);
      expect(claimed[0]?.id).toBe("send_job_claim_once");

      const [storedJob] = await db
        .select()
        .from(sendJobs)
        .where(eq(sendJobs.id, "send_job_claim_once"))
        .limit(1);

      expect(storedJob?.status).toBe("processing");
      expect(["worker-a", "worker-b"]).toContain(storedJob?.lockedBy);
    } finally {
      await bundleA.client.end();
      await bundleB.client.end();
    }
  });

  it("writes delivery attempt, marks send job sent, and completes campaign on success", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_success",
    });

    const claimed = await claimSendJobForProcessing(db, {
      lockedBy: "worker-success",
    });

    expect(claimed?.id).toBe("send_job_success");

    const result = await processSendJob(db, {
      sendJobId: "send_job_success",
      lockedBy: "worker-success",
      providerAdapter: createAdapter({
        ok: true,
        provider: "resend",
        providerMessageId: "provider_msg_success",
        responsePayloadJson: { accepted: true },
      }),
    });

    expect(result.finalStatus).toBe("sent");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_success"))
      .limit(1);
    expect(job?.status).toBe("sent");
    expect(job?.attemptCount).toBe(1);
    expect(job?.providerMessageId).toBe("provider_msg_success");
    expect(job?.processedAt).not.toBeNull();

    const [attempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_success"))
      .limit(1);
    expect(attempt?.status).toBe("sent");
    expect(attempt?.providerMessageId).toBe("provider_msg_success");
    expect(attempt?.errorCode).toBeNull();

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, "campaign_1"))
      .limit(1);
    expect(campaign?.status).toBe("completed");
  });

  it("processes one explicit send job queue message without relying on poll semantics", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_queue_message",
    });

    const result = await handleSendJobQueueMessage({
      source: "vercel-queue",
      message: {
        version: 1,
        kind: "send_job.process",
        sendJobId: "send_job_queue_message",
      },
    });

    expect(result).toEqual({
      disposition: "processed",
      sendJobId: "send_job_queue_message",
      finalStatus: "sent",
    });

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_queue_message"))
      .limit(1);
    expect(job?.status).toBe("sent");
  });

  it("skips one explicit send job queue message when the referenced job is not claimable", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_queue_message_skip",
    });

    await db
      .update(sendJobs)
      .set({
        scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(sendJobs.id, "send_job_queue_message_skip"));

    const result = await handleSendJobQueueMessage({
      source: "vercel-queue",
      message: {
        version: 1,
        kind: "send_job.process",
        sendJobId: "send_job_queue_message_skip",
      },
    });

    expect(result).toEqual({
      disposition: "skipped",
      reason: "not_claimable",
      sendJobId: "send_job_queue_message_skip",
    });

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_queue_message_skip"));
    expect(attempts).toHaveLength(0);
  });

  it("schedules the first retryable failure into the future and keeps it unclaimable until due", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_retryable",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-retryable",
    });

    const startedAt = Date.now();

    const result = await processSendJob(db, {
      sendJobId: "send_job_retryable",
      lockedBy: "worker-retryable",
      providerAdapter: createAdapter({
        ok: false,
        provider: "resend",
        classification: "retryable",
        errorCode: "RATE_LIMIT",
        errorMessage: "Transient provider limit",
        responsePayloadJson: { accepted: false },
      }),
    });

    expect(result.finalStatus).toBe("pending");
    expect(result.classification).toBe("retryable");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_retryable"))
      .limit(1);
    expect(job?.status).toBe("pending");
    expect(job?.attemptCount).toBe(1);
    expect(job?.processedAt).toBeNull();
    expect(job?.lastErrorCode).toBe("RATE_LIMIT");
    expect(job?.scheduledAt).not.toBeNull();
    expect(job?.scheduledAt!.getTime()).toBeGreaterThanOrEqual(
      startedAt + sendJobRetryBaseDelayMs,
    );

    const immediatelyClaimed = await claimSendJobForProcessing(db, {
      lockedBy: "worker-immediate-retry",
    });
    expect(immediatelyClaimed).toBeNull();

    const [attempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_retryable"))
      .limit(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.errorCode).toBe("RATE_LIMIT");

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, "campaign_1"))
      .limit(1);
    expect(campaign?.status).toBe("queued");
  });

  it("applies exponential backoff across repeated retryable failures and eventually fails at max attempts", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_retryable_terminal",
    });

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        attemptCount: 1,
        lockedAt: new Date(),
        lockedBy: "worker-retryable-second-delay",
        processedAt: null,
        scheduledAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(),
      })
      .where(eq(sendJobs.id, "send_job_retryable_terminal"));

    const secondAttemptStartedAt = Date.now();

    const secondAttemptResult = await processSendJob(db, {
      sendJobId: "send_job_retryable_terminal",
      lockedBy: "worker-retryable-second-delay",
      providerAdapter: createAdapter({
        ok: false,
        provider: "resend",
        classification: "retryable",
        errorCode: "TEMPORARY_PROVIDER_OUTAGE",
        errorMessage: "Transient provider outage",
        responsePayloadJson: { accepted: false },
      }),
    });

    expect(secondAttemptResult.finalStatus).toBe("pending");
    expect(secondAttemptResult.classification).toBe("retryable");

    const [afterSecondAttempt] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_retryable_terminal"))
      .limit(1);
    expect(afterSecondAttempt?.status).toBe("pending");
    expect(afterSecondAttempt?.attemptCount).toBe(2);
    expect(afterSecondAttempt?.scheduledAt!.getTime()).toBeGreaterThanOrEqual(
      secondAttemptStartedAt + sendJobRetryBaseDelayMs * 2,
    );

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        attemptCount: 2,
        lockedAt: new Date(),
        lockedBy: "worker-retryable-terminal",
        processedAt: null,
        scheduledAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(),
      })
      .where(eq(sendJobs.id, "send_job_retryable_terminal"));

    const result = await processSendJob(db, {
      sendJobId: "send_job_retryable_terminal",
      lockedBy: "worker-retryable-terminal",
      providerAdapter: createAdapter({
        ok: false,
        provider: "resend",
        classification: "retryable",
        errorCode: "TEMPORARY_PROVIDER_OUTAGE",
        errorMessage: "Transient provider outage",
        responsePayloadJson: { accepted: false },
      }),
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.classification).toBe("retryable");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_retryable_terminal"))
      .limit(1);
    expect(job?.status).toBe("failed");
    expect(job?.attemptCount).toBe(3);
    expect(job?.processedAt).not.toBeNull();
    expect(job?.lockedAt).toBeNull();
    expect(job?.lockedBy).toBeNull();
    expect(job?.lastErrorCode).toBe("TEMPORARY_PROVIDER_OUTAGE");

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_retryable_terminal"));
    expect(attempts).toHaveLength(2);
    expect(attempts.every((attempt) => attempt.status === "failed")).toBe(true);
  });

  it("uses the mock provider unknown classification as retryable-with-backoff until max attempts are exhausted", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_unknown",
      recipientEmail: "person-unknown@example.com",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-unknown-first",
    });

    const startedAt = Date.now();
    const mockProviderAdapter = createResendProviderAdapter({
      mode: "mock",
      secretBox: createSecretBox(TEST_API_ENCRYPTION_KEY),
    });

    const firstResult = await processSendJob(db, {
      sendJobId: "send_job_unknown",
      lockedBy: "worker-unknown-first",
      providerAdapter: mockProviderAdapter,
    });

    expect(firstResult.finalStatus).toBe("pending");
    expect(firstResult.classification).toBe("unknown");

    const [afterFirst] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_unknown"))
      .limit(1);
    expect(afterFirst?.status).toBe("pending");
    expect(afterFirst?.attemptCount).toBe(1);
    expect(afterFirst?.scheduledAt).not.toBeNull();
    expect(afterFirst?.scheduledAt!.getTime()).toBeGreaterThanOrEqual(
      startedAt + sendJobRetryBaseDelayMs,
    );
    expect(afterFirst?.lastErrorCode).toBe("MOCK_UNKNOWN");

    const [firstAttempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_unknown"))
      .limit(1);
    expect(firstAttempt?.errorCode).toBe("MOCK_UNKNOWN");

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        attemptCount: 2,
        lockedAt: new Date(),
        lockedBy: "worker-unknown-terminal",
        processedAt: null,
        scheduledAt: new Date(Date.now() - 60_000),
        updatedAt: new Date(),
      })
      .where(eq(sendJobs.id, "send_job_unknown"));

    const secondResult = await processSendJob(db, {
      sendJobId: "send_job_unknown",
      lockedBy: "worker-unknown-terminal",
      providerAdapter: mockProviderAdapter,
    });

    expect(secondResult.finalStatus).toBe("failed");
    expect(secondResult.classification).toBe("unknown");

    const [afterSecond] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_unknown"))
      .limit(1);
    expect(afterSecond?.status).toBe("failed");
    expect(afterSecond?.attemptCount).toBe(3);
    expect(afterSecond?.processedAt).not.toBeNull();
    expect(afterSecond?.lastErrorCode).toBe("MOCK_UNKNOWN");

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_unknown"));
    expect(attempts).toHaveLength(2);
    expect(attempts.every((attempt) => attempt.status === "failed")).toBe(true);
  });

  it("rejects duplicate processing of the same send job after it has already been completed", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_duplicate_process",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-duplicate-process",
    });

    const firstResult = await processSendJob(db, {
      sendJobId: "send_job_duplicate_process",
      lockedBy: "worker-duplicate-process",
      providerAdapter: createAdapter({
        ok: true,
        provider: "resend",
        providerMessageId: "provider_msg_duplicate",
        responsePayloadJson: { accepted: true },
      }),
    });

    expect(firstResult.finalStatus).toBe("sent");

    await expect(
      processSendJob(db, {
        sendJobId: "send_job_duplicate_process",
        lockedBy: "worker-duplicate-process",
        providerAdapter: {
          async send() {
            throw new Error("provider should not be called on duplicate process");
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    } satisfies Partial<AppError>);

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_duplicate_process"));
    expect(attempts).toHaveLength(1);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_duplicate_process"))
      .limit(1);
    expect(job?.status).toBe("sent");
    expect(job?.attemptCount).toBe(1);
  });

  it("returns a no-op summary when consumer polling finds no pending jobs", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_future_pending",
    });

    await db
      .update(sendJobs)
      .set({
        scheduledAt: new Date(Date.now() + 10 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(sendJobs.id, "send_job_future_pending"));

    const summary = await handleConsumerEvent({
      source: "local-shim",
      messageCount: 1,
    });

    expect(summary.claimedCount).toBe(0);
    expect(summary.sentCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.requeuedCount).toBe(0);
    expect(summary.providerMode).toBe("mock");

    const attempts = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_future_pending"));
    expect(attempts).toHaveLength(0);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_future_pending"))
      .limit(1);
    expect(job?.status).toBe("pending");
    expect(job?.lockedAt).toBeNull();
    expect(job?.lockedBy).toBeNull();
  });

  it("writes delivery attempt and marks send job failed for non-retryable failure", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_non_retryable",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-non-retryable",
    });

    const result = await processSendJob(db, {
      sendJobId: "send_job_non_retryable",
      lockedBy: "worker-non-retryable",
      providerAdapter: createAdapter({
        ok: false,
        provider: "resend",
        classification: "non_retryable",
        errorCode: "INVALID_RECIPIENT",
        errorMessage: "Recipient address rejected",
        responsePayloadJson: { accepted: false },
      }),
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.classification).toBe("non_retryable");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_non_retryable"))
      .limit(1);
    expect(job?.status).toBe("failed");
    expect(job?.attemptCount).toBe(1);
    expect(job?.processedAt).not.toBeNull();
    expect(job?.lastErrorCode).toBe("INVALID_RECIPIENT");

    const [attempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_non_retryable"))
      .limit(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.errorCode).toBe("INVALID_RECIPIENT");

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, "campaign_1"))
      .limit(1);
    expect(campaign?.status).toBe("failed");
  });

  it("fails with a non-retryable delivery attempt when workspace sending config is missing", async () => {
    await seedScenario({
      db,
      includeSendingConfig: false,
      sendJobId: "send_job_missing_config",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-missing-config",
    });

    const result = await processSendJob(db, {
      sendJobId: "send_job_missing_config",
      lockedBy: "worker-missing-config",
      providerAdapter: {
        async send() {
          throw new Error("provider should not be called without workspace config");
        },
      },
    });

    expect(result.finalStatus).toBe("failed");
    expect(result.classification).toBe("non_retryable");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_missing_config"))
      .limit(1);
    expect(job?.status).toBe("failed");
    expect(job?.lastErrorCode).toBe("MISSING_WORKSPACE_SENDING_CONFIG");

    const [attempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_missing_config"))
      .limit(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.errorCode).toBe("MISSING_WORKSPACE_SENDING_CONFIG");
  });

  it("exposes an internal dev-only route to consume one poll and process a pending send job", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_internal_route",
      recipientEmail: "dev-success@example.com",
    });

    const app = createLocalAsyncShimApp();
    await app.ready();

    const forbidden = await app.inject({
      method: "POST",
      url: "/internal/consume-once",
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);

    const response = await app.inject({
      method: "POST",
      url: "/internal/consume-once",
      headers: {
        "x-smartsend-internal-dev": "true",
      },
      payload: {
        messageCount: 1,
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      mode: string;
      summary: {
        claimedCount: number;
        failedCount: number;
        providerMode: string;
        requeuedCount: number;
        sentCount: number;
      };
    };

    expect(payload.mode).toBe("development-only");
    expect(payload.summary.claimedCount).toBe(1);
    expect(payload.summary.sentCount).toBe(1);
    expect(payload.summary.failedCount).toBe(0);
    expect(payload.summary.requeuedCount).toBe(0);
    expect(payload.summary.providerMode).toBe("mock");

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_internal_route"))
      .limit(1);
    expect(job?.status).toBe("sent");

    const [attempt] = await db
      .select()
      .from(deliveryAttempts)
      .where(eq(deliveryAttempts.sendJobId, "send_job_internal_route"))
      .limit(1);
    expect(attempt?.status).toBe("sent");

    await app.close();
  });

  it("recovers one timed-out processing job back to pending and refreshes campaign status", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_recovery_pending",
    });

    const lockedAt = new Date(Date.now() - 20 * 60 * 1000);

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        lockedAt,
        lockedBy: "worker-timeout",
        updatedAt: lockedAt,
      })
      .where(eq(sendJobs.id, "send_job_recovery_pending"));

    await db
      .update(campaigns)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, "campaign_1"));

    const result = await recoverStuckProcessingSendJobs(db, {
      lockTimeoutMs: 15 * 60 * 1000,
    });

    expect(result.pendingCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.touchedCampaignCount).toBe(1);
    expect(result.touchedSendJobIds).toEqual(["send_job_recovery_pending"]);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_recovery_pending"))
      .limit(1);
    expect(job?.status).toBe("pending");
    expect(job?.attemptCount).toBe(1);
    expect(job?.lockedAt).toBeNull();
    expect(job?.lockedBy).toBeNull();
    expect(job?.processedAt).toBeNull();
    expect(job?.lastErrorCode).toBe(recoveryPendingErrorCode);

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, "campaign_1"))
      .limit(1);
    expect(campaign?.status).toBe("queued");
  });

  it("keeps recovery idempotent when the same timed-out job sweep runs twice", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_recovery_idempotent",
    });

    const lockedAt = new Date(Date.now() - 20 * 60 * 1000);

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        lockedAt,
        lockedBy: "worker-timeout",
        updatedAt: lockedAt,
      })
      .where(eq(sendJobs.id, "send_job_recovery_idempotent"));

    const first = await recoverStuckProcessingSendJobs(db, {
      lockTimeoutMs: 15 * 60 * 1000,
    });
    const second = await recoverStuckProcessingSendJobs(db, {
      lockTimeoutMs: 15 * 60 * 1000,
    });

    expect(first.pendingCount).toBe(1);
    expect(first.failedCount).toBe(0);
    expect(second.pendingCount).toBe(0);
    expect(second.failedCount).toBe(0);
    expect(second.touchedCampaignCount).toBe(0);
    expect(second.touchedSendJobIds).toEqual([]);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_recovery_idempotent"))
      .limit(1);
    expect(job?.status).toBe("pending");
    expect(job?.attemptCount).toBe(1);
    expect(job?.lastErrorCode).toBe(recoveryPendingErrorCode);
  });

  it("fails timed-out jobs at max attempts and refreshes mixed campaign aggregates from send_jobs truth", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_recovery_failed",
    });

    await insertSendJob(db, {
      id: "send_job_already_sent",
      status: "sent",
      attemptCount: 1,
      processedAt: new Date(),
      providerMessageId: "provider_msg_done",
      recipientEmail: "sent@example.com",
      recipientName: "Sent Contact",
      contactId: "contact_2",
    });

    const lockedAt = new Date(Date.now() - 20 * 60 * 1000);

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        attemptCount: 2,
        maxAttempts: 3,
        lockedAt,
        lockedBy: "worker-timeout",
        processedAt: null,
        updatedAt: lockedAt,
      })
      .where(eq(sendJobs.id, "send_job_recovery_failed"));

    await db
      .update(campaigns)
      .set({
        status: "processing",
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, "campaign_1"));

    const result = await recoverStuckProcessingSendJobs(db, {
      lockTimeoutMs: 15 * 60 * 1000,
    });

    expect(result.pendingCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.touchedCampaignCount).toBe(1);
    expect(result.touchedSendJobIds).toEqual(["send_job_recovery_failed"]);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_recovery_failed"))
      .limit(1);
    expect(job?.status).toBe("failed");
    expect(job?.attemptCount).toBe(3);
    expect(job?.processedAt).not.toBeNull();
    expect(job?.lockedAt).toBeNull();
    expect(job?.lastErrorCode).toBe(recoveryFailedErrorCode);

    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, "campaign_1"))
      .limit(1);
    expect(campaign?.status).toBe("failed");
  });

  it("exposes an internal dev-only route to trigger one recovery sweep", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_internal_recovery",
    });

    const lockedAt = new Date(Date.now() - 20 * 60 * 1000);

    await db
      .update(sendJobs)
      .set({
        status: "processing",
        lockedAt,
        lockedBy: "worker-timeout",
        updatedAt: lockedAt,
      })
      .where(eq(sendJobs.id, "send_job_internal_recovery"));

    const app = createLocalAsyncShimApp();
    await app.ready();

    const forbidden = await app.inject({
      method: "POST",
      url: "/internal/recover-once",
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);

    const response = await app.inject({
      method: "POST",
      url: "/internal/recover-once",
      headers: {
        "x-smartsend-internal-dev": "true",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      mode: string;
      summary: {
        failedCount: number;
        pendingCount: number;
        timedOutBefore: string;
        touchedCampaignCount: number;
        touchedSendJobIds: string[];
      };
    };

    expect(payload.mode).toBe("development-only");
    expect(payload.summary.pendingCount).toBe(1);
    expect(payload.summary.failedCount).toBe(0);
    expect(payload.summary.touchedCampaignCount).toBe(1);
    expect(payload.summary.touchedSendJobIds).toEqual(["send_job_internal_recovery"]);

    const [job] = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.id, "send_job_internal_recovery"))
      .limit(1);
    expect(job?.status).toBe("pending");

    await app.close();
  });
});

function createAdapter(
  result: Awaited<ReturnType<ProviderAdapter["send"]>>,
): ProviderAdapter {
  return {
    async send() {
      return result;
    },
  };
}

async function seedScenario({
  db,
  includeSendingConfig,
  recipientEmail = "person@example.com",
  sendJobId,
}: {
  db: Database;
  includeSendingConfig: boolean;
  recipientEmail?: string;
  sendJobId: string;
}) {
  const now = new Date();

  await seedWorkspaceMembershipFixture(db, {
    users: [
      {
        id: "user_1",
        email: "user1@example.com",
        name: "User One",
      },
    ],
    workspaces: [
      {
        id: "ws_1",
        name: "Workspace One",
      },
    ],
    memberships: [],
  });

  await insertTemplateFixture(db, {
    id: "tpl_1",
    workspaceId: "ws_1",
    name: "Template One",
    subject: "Hello",
    bodyHtml: "<p>Hello</p>",
  });

  await insertContactFixture(db, {
    id: "contact_1",
    workspaceId: "ws_1",
    email: recipientEmail,
    name: "Contact One",
    customFields: {},
  });

  await insertCampaignFixture(db, {
    id: "campaign_1",
    workspaceId: "ws_1",
    templateId: "tpl_1",
    createdByUserId: "user_1",
    name: "Campaign One",
    status: "queued",
    targetType: "all_contacts",
    targetGroupName: null,
    queuedAt: now,
  });

  await insertSendJobFixture(db, {
    id: sendJobId,
    workspaceId: "ws_1",
    campaignId: "campaign_1",
    contactId: "contact_1",
    recipientEmail,
    recipientName: "Contact One",
    renderedSubject: "Hello",
    renderedBody: "<p>Hello</p>",
    status: "pending",
    attemptCount: 0,
    maxAttempts: 3,
    scheduledAt: new Date(now.getTime() - 60_000),
    lockedAt: null,
    lockedBy: null,
    processedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "resend",
    providerMessageId: null,
  });

  if (includeSendingConfig) {
    const secretBox = createSecretBox(TEST_API_ENCRYPTION_KEY);

    await insertWorkspaceSendingConfigFixture(db, {
      workspaceId: "ws_1",
      provider: "resend",
      fromEmail: "sender@example.com",
      fromName: "Sender",
      replyToEmail: "reply@example.com",
      encryptedApiKey: secretBox.encrypt("resend_api_key_test"),
    });
  }
}

async function insertSendJob(
  db: Database,
  input: {
    attemptCount: number;
    contactId: string;
    id: string;
    lockedAt?: Date | null;
    lockedBy?: string | null;
    maxAttempts?: number;
    processedAt?: Date | null;
    providerMessageId?: string | null;
    recipientEmail: string;
    recipientName: string;
    status: NonNullable<typeof sendJobs.$inferInsert.status>;
  },
) {
  if (input.contactId !== "contact_1") {
    await insertContactFixture(db, {
      id: input.contactId,
      workspaceId: "ws_1",
      email: input.recipientEmail,
      name: input.recipientName,
      customFields: {},
    });
  }

  await insertSendJobFixture(db, {
    id: input.id,
    workspaceId: "ws_1",
    campaignId: "campaign_1",
    contactId: input.contactId,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    renderedSubject: "Hello",
    renderedBody: "<p>Hello</p>",
    status: input.status,
    attemptCount: input.attemptCount,
    maxAttempts: input.maxAttempts ?? 3,
    scheduledAt: new Date(Date.now() - 60_000),
    lockedAt: input.lockedAt ?? null,
    lockedBy: input.lockedBy ?? null,
    processedAt: input.processedAt ?? null,
    lastErrorCode: null,
    lastErrorMessage: null,
    provider: "resend",
    providerMessageId: input.providerMessageId ?? null,
  });
}
