import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  auditLogs,
  campaigns,
  contacts,
  createDatabase,
  sendJobs,
  templates,
  users,
  workspaceMembers,
  workspaces,
  workspaceSendingConfigs,
} from "@smartsend/db";

import { createApiApp } from "./app.js";

const DATABASE_URL = process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

const integration = describe.skipIf(!hasDatabase);

integration("api protected routes", () => {
  const dbBundle = createDatabase(DATABASE_URL ?? "postgres://invalid");
  const db = dbBundle.db;

  beforeAll(async () => {
    await db.execute(sql`select 1`);
  });

  afterAll(async () => {
    await dbBundle.client.end();
  });

  beforeEach(async () => {
    await db.delete(auditLogs);
    await db.delete(workspaceSendingConfigs);
    await db.delete(sendJobs);
    await db.delete(campaigns);
    await db.delete(contacts);
    await db.delete(templates);
    await db.delete(workspaceMembers);
    await db.delete(workspaces);
    await db.delete(users);

    await db.insert(users).values([
      {
        id: "user_1",
        email: "user1@example.com",
        name: "User One",
      },
      {
        id: "user_2",
        email: "user2@example.com",
        name: "User Two",
      },
    ]);

    await db.insert(workspaces).values([
      {
        id: "ws_1",
        name: "Workspace One",
      },
      {
        id: "ws_2",
        name: "Workspace Two",
      },
    ]);

    await db.insert(workspaceMembers).values([
      {
        workspaceId: "ws_1",
        userId: "user_1",
        role: "owner",
      },
      {
        workspaceId: "ws_2",
        userId: "user_2",
        role: "owner",
      },
    ]);
  });

  it("rejects unauthenticated protected requests", async () => {
    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/contacts",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects requests outside workspace membership", async () => {
    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/contacts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_2",
      },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("enforces workspace boundary when listing contacts", async () => {
    await db.insert(contacts).values([
      {
        id: "contact_a",
        workspaceId: "ws_1",
        email: "a@example.com",
        name: "Contact A",
        customFields: {},
      },
      {
        id: "contact_b",
        workspaceId: "ws_2",
        email: "b@example.com",
        name: "Contact B",
        customFields: {},
      },
    ]);

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/contacts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      items: Array<{ id: string; workspaceId: string }>;
      total: number;
    };

    expect(payload.total).toBe(1);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.id).toBe("contact_a");
    expect(payload.items[0]?.workspaceId).toBe("ws_1");

    await app.close();
  });

  it("renders template preview and reports missing variables", async () => {
    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/templates/preview-render",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        template: {
          name: "Welcome",
          subject: "Hi {{name}}",
          bodyHtml: "<p>{{name}} from {{company}}</p>",
        },
        variables: {
          name: "Alice",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      renderedSubject: string;
      renderedBodyHtml: string;
      missingVariables: string[];
    };

    expect(payload.renderedSubject).toBe("Hi Alice");
    expect(payload.renderedBodyHtml).toContain("Alice");
    expect(payload.missingVariables).toContain("company");

    await app.close();
  });

  it("upserts workspace sending config without exposing api key", async () => {
    const app = createApiApp({
      services: {
        db,
        secretBox: {
          encrypt(value: string) {
            return `enc:${value}`;
          },
          decrypt(payload: string) {
            return payload.replace(/^enc:/, "");
          },
        },
      },
    });
    await app.ready();

    const upsert = await app.inject({
      method: "PUT",
      url: "/api/workspace-sending-config",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        provider: "resend",
        fromEmail: "sender@example.com",
        fromName: "Sender",
        replyToEmail: "reply@example.com",
        apiKey: "secret-key",
      },
    });

    expect(upsert.statusCode).toBe(200);
    const upsertPayload = upsert.json() as {
      config: { hasApiKey: boolean; encryptedApiKey?: string };
    };
    expect(upsertPayload.config.hasApiKey).toBe(true);
    expect("encryptedApiKey" in upsertPayload.config).toBe(false);

    const get = await app.inject({
      method: "GET",
      url: "/api/workspace-sending-config",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(get.statusCode).toBe(200);
    const getPayload = get.json() as { config: { hasApiKey: boolean } | null };
    expect(getPayload.config?.hasApiKey).toBe(true);

    await app.close();
  });

  it("queues draft campaign and creates send jobs", async () => {
    await db.insert(templates).values({
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}} from {{company}}</p>",
    });

    await db.insert(contacts).values([
      {
        id: "c_1",
        workspaceId: "ws_1",
        email: "alice@example.com",
        name: "Alice",
        company: "Acme",
        customFields: {},
      },
      {
        id: "c_2",
        workspaceId: "ws_1",
        email: "bob@example.com",
        name: "Bob",
        company: "Beta",
        customFields: {},
      },
    ]);

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const draft = await app.inject({
      method: "POST",
      url: "/api/campaigns/drafts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        templateId: "tpl_1",
        name: "Campaign A",
        target: {
          type: "all_contacts",
        },
      },
    });

    expect(draft.statusCode).toBe(200);
    const campaignId = (draft.json() as { campaign: { id: string } }).campaign.id;

    const queued = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        maxAttempts: 3,
      },
    });

    expect(queued.statusCode).toBe(200);
    const queuedPayload = queued.json() as {
      queuedCount: number;
      status: string;
    };
    expect(queuedPayload.status).toBe("queued");
    expect(queuedPayload.queuedCount).toBe(2);

    const jobs = await db
      .select()
      .from(sendJobs)
      .where(eq(sendJobs.campaignId, campaignId));
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.status).toBe("pending");

    const [updatedCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    expect(updatedCampaign?.status).toBe("queued");

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, "ws_1"));
    expect(audits.some((row) => row.action === "campaign.createDraft")).toBe(true);
    expect(audits.some((row) => row.action === "campaign.queueCampaign")).toBe(true);

    await app.close();
  });

  it("does not allow queueing a campaign twice", async () => {
    await db.insert(templates).values({
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await db.insert(contacts).values({
      id: "c_1",
      workspaceId: "ws_1",
      email: "alice@example.com",
      name: "Alice",
      customFields: {},
    });

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const draft = await app.inject({
      method: "POST",
      url: "/api/campaigns/drafts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        templateId: "tpl_1",
        name: "Campaign A",
        target: {
          type: "all_contacts",
        },
      },
    });

    const campaignId = (draft.json() as { campaign: { id: string } }).campaign.id;

    const first = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(second.statusCode).toBe(400);

    await app.close();
  });

  it("enforces workspace isolation for queueCampaign", async () => {
    await db.insert(templates).values({
      id: "tpl_2",
      workspaceId: "ws_2",
      name: "Template WS2",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    const [campaign] = await db
      .insert(campaigns)
      .values({
        id: "camp_ws2",
        workspaceId: "ws_2",
        templateId: "tpl_2",
        createdByUserId: "user_2",
        name: "WS2 Campaign",
        status: "draft",
        targetType: "all_contacts",
        targetGroupName: null,
      })
      .returning();

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign?.id}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("fails queueCampaign when target has no active contacts", async () => {
    await db.insert(templates).values({
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const draft = await app.inject({
      method: "POST",
      url: "/api/campaigns/drafts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        templateId: "tpl_1",
        name: "Campaign A",
        target: {
          type: "all_contacts",
        },
      },
    });
    const campaignId = (draft.json() as { campaign: { id: string } }).campaign.id;

    const queue = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(queue.statusCode).toBe(400);

    const failureAudits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "campaign.queueCampaign.failed"));
    expect(failureAudits.length).toBeGreaterThan(0);

    await app.close();
  });

  it("returns campaign progress and send jobs list", async () => {
    await db.insert(templates).values({
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await db.insert(contacts).values([
      {
        id: "c_1",
        workspaceId: "ws_1",
        email: "alice@example.com",
        name: "Alice",
        customFields: {},
      },
      {
        id: "c_2",
        workspaceId: "ws_1",
        email: "bob@example.com",
        name: "Bob",
        customFields: {},
      },
    ]);

    const app = createApiApp({
      services: {
        db,
      },
    });
    await app.ready();

    const draft = await app.inject({
      method: "POST",
      url: "/api/campaigns/drafts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        templateId: "tpl_1",
        name: "Campaign A",
        target: {
          type: "all_contacts",
        },
      },
    });
    const campaignId = (draft.json() as { campaign: { id: string } }).campaign.id;

    await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaignId}/queue`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    await db
      .update(sendJobs)
      .set({
        status: "sent",
        processedAt: new Date(),
      })
      .where(eq(sendJobs.contactId, "c_1"));

    const progress = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/progress`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(progress.statusCode).toBe(200);
    const progressPayload = progress.json() as {
      total: number;
      sent: number;
      pending: number;
    };
    expect(progressPayload.total).toBe(2);
    expect(progressPayload.sent).toBe(1);
    expect(progressPayload.pending).toBe(1);

    const jobs = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaignId}/send-jobs`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(jobs.statusCode).toBe(200);
    const jobsPayload = jobs.json() as { items: Array<{ id: string }>; total: number };
    expect(jobsPayload.total).toBe(2);
    expect(jobsPayload.items).toHaveLength(2);

    await app.close();
  });
});
