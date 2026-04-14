import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  campaigns,
  contacts,
  createDatabase,
  deliveryAttempts,
  sendJobs,
  templates,
  users,
  workspaceSendingConfigs,
  workspaces,
  type Database,
} from "@smartsend/db";
import type { ProviderAdapter } from "@smartsend/domain";
import {
  claimSendJobForProcessing,
  processSendJob,
} from "@smartsend/domain";
import { createSecretBox } from "@smartsend/shared";

import { createLocalAsyncShimApp } from "./app.js";

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
    await db.delete(deliveryAttempts);
    await db.delete(workspaceSendingConfigs);
    await db.delete(sendJobs);
    await db.delete(campaigns);
    await db.delete(contacts);
    await db.delete(templates);
    await db.delete(workspaces);
    await db.delete(users);
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

  it("writes delivery attempt and requeues send job for retryable failure", async () => {
    await seedScenario({
      db,
      includeSendingConfig: true,
      sendJobId: "send_job_retryable",
    });

    await claimSendJobForProcessing(db, {
      lockedBy: "worker-retryable",
    });

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

  await db.insert(users).values({
    id: "user_1",
    email: "user1@example.com",
    name: "User One",
  });

  await db.insert(workspaces).values({
    id: "ws_1",
    name: "Workspace One",
  });

  await db.insert(templates).values({
    id: "tpl_1",
    workspaceId: "ws_1",
    name: "Template One",
    subject: "Hello",
    bodyHtml: "<p>Hello</p>",
  });

  await db.insert(contacts).values({
    id: "contact_1",
    workspaceId: "ws_1",
    email: recipientEmail,
    name: "Contact One",
    customFields: {},
  });

  await db.insert(campaigns).values({
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

  await db.insert(sendJobs).values({
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

    await db.insert(workspaceSendingConfigs).values({
      workspaceId: "ws_1",
      provider: "resend",
      fromEmail: "sender@example.com",
      fromName: "Sender",
      replyToEmail: "reply@example.com",
      encryptedApiKey: secretBox.encrypt("resend_api_key_test"),
    });
  }
}
