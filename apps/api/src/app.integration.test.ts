import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  auditLogs,
  campaigns,
  contacts,
  createDatabase,
  deliveryAttempts,
  insertCampaignFixture,
  insertContactFixture,
  insertTemplateFixture,
  resetIntegrationTestDatabase,
  sendJobs,
  seedWorkspaceMembershipFixture,
  workspaceMembers,
} from "@smartsend/db";

import { createDevHeaderAuthAdapter } from "./auth/dev-header-auth.js";
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
    await resetIntegrationTestDatabase(db);
    await seedWorkspaceMembershipFixture(db, {
      users: [
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
      ],
      workspaces: [
        {
          id: "ws_1",
          name: "Workspace One",
        },
        {
          id: "ws_2",
          name: "Workspace Two",
        },
      ],
      memberships: [
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
      ],
    });
  });

  function createTestApp() {
    return createApiApp({
      services: {
        db,
        authAdapter: createDevHeaderAuthAdapter(),
      },
    });
  }

  it("rejects unauthenticated protected requests", async () => {
    const app = createTestApp();
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/contacts",
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects requests outside workspace membership", async () => {
    const app = createTestApp();
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
    await insertContactFixture(db, {
      id: "contact_a",
      workspaceId: "ws_1",
      email: "a@example.com",
      name: "Contact A",
      customFields: {},
    });
    await insertContactFixture(db, {
      id: "contact_b",
      workspaceId: "ws_2",
      email: "b@example.com",
      name: "Contact B",
      customFields: {},
    });

    const app = createTestApp();
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
    const app = createTestApp();
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
        authAdapter: createDevHeaderAuthAdapter(),
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

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "workspace_sending_config.upsert"))
      .limit(1);
    expect(audit?.workspaceId).toBe("ws_1");
    expect(audit?.actorUserId).toBe("user_1");
    expect(audit?.targetType).toBe("workspace_sending_config");
    expect(audit?.targetId).toBe("ws_1");

    await app.close();
  });

  it("writes audit logs for contact create, update, remove, and import", async () => {
    const app = createTestApp();
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        email: "new-contact@example.com",
        name: "New Contact",
      },
    });
    expect(create.statusCode).toBe(200);
    const createdContactId = (create.json() as { contact: { id: string } }).contact.id;

    const update = await app.inject({
      method: "PATCH",
      url: `/api/contacts/${createdContactId}`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        name: "Updated Contact",
      },
    });
    expect(update.statusCode).toBe(200);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/contacts/${createdContactId}`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(remove.statusCode).toBe(200);

    const imported = await app.inject({
      method: "POST",
      url: "/api/contacts/import",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        contacts: [
          {
            email: "imported-a@example.com",
            name: "Imported A",
          },
          {
            email: "imported-b@example.com",
            name: "Imported B",
          },
        ],
      },
    });
    expect(imported.statusCode).toBe(200);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, "ws_1"));

    const createAudit = audits.find((row) => row.action === "contact.create");
    expect(createAudit?.actorUserId).toBe("user_1");
    expect(createAudit?.targetType).toBe("contact");
    expect(createAudit?.targetId).toBe(createdContactId);

    const updateAudit = audits.find((row) => row.action === "contact.update");
    expect(updateAudit?.actorUserId).toBe("user_1");
    expect(updateAudit?.targetType).toBe("contact");
    expect(updateAudit?.targetId).toBe(createdContactId);

    const removeAudit = audits.find((row) => row.action === "contact.remove");
    expect(removeAudit?.actorUserId).toBe("user_1");
    expect(removeAudit?.targetType).toBe("contact");
    expect(removeAudit?.targetId).toBe(createdContactId);

    const importAudit = audits.find((row) => row.action === "contact.import");
    expect(importAudit?.actorUserId).toBe("user_1");
    expect(importAudit?.targetType).toBe("contact_batch");
    expect(importAudit?.targetId).toBeNull();
    expect(importAudit?.metadata).toMatchObject({
      importedCount: 2,
    });

    await app.close();
  });

  it("writes audit logs for template create, update, and remove", async () => {
    const app = createTestApp();
    await app.ready();

    const create = await app.inject({
      method: "POST",
      url: "/api/templates",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        name: "Audit Template",
        subject: "Hello",
        bodyHtml: "<p>Hello</p>",
      },
    });
    expect(create.statusCode).toBe(200);
    const templateId = (create.json() as { template: { id: string } }).template.id;

    const update = await app.inject({
      method: "PATCH",
      url: `/api/templates/${templateId}`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
      payload: {
        subject: "Updated Subject",
      },
    });
    expect(update.statusCode).toBe(200);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/templates/${templateId}`,
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(remove.statusCode).toBe(200);

    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, "ws_1"));

    const createAudit = audits.find((row) => row.action === "template.create");
    expect(createAudit?.actorUserId).toBe("user_1");
    expect(createAudit?.targetType).toBe("template");
    expect(createAudit?.targetId).toBe(templateId);

    const updateAudit = audits.find((row) => row.action === "template.update");
    expect(updateAudit?.actorUserId).toBe("user_1");
    expect(updateAudit?.targetType).toBe("template");
    expect(updateAudit?.targetId).toBe(templateId);

    const removeAudit = audits.find((row) => row.action === "template.remove");
    expect(removeAudit?.actorUserId).toBe("user_1");
    expect(removeAudit?.targetType).toBe("template");
    expect(removeAudit?.targetId).toBe(templateId);

    await app.close();
  });

  it("queues draft campaign and creates send jobs", async () => {
    await insertTemplateFixture(db, {
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}} from {{company}}</p>",
    });

    await insertContactFixture(db, {
      id: "c_1",
      workspaceId: "ws_1",
      email: "alice@example.com",
      name: "Alice",
      company: "Acme",
      customFields: {},
    });
    await insertContactFixture(db, {
      id: "c_2",
      workspaceId: "ws_1",
      email: "bob@example.com",
      name: "Bob",
      company: "Beta",
      customFields: {},
    });

    const app = createTestApp();
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
    await insertTemplateFixture(db, {
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await insertContactFixture(db, {
      id: "c_1",
      workspaceId: "ws_1",
      email: "alice@example.com",
      name: "Alice",
      customFields: {},
    });

    const app = createTestApp();
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
    await insertTemplateFixture(db, {
      id: "tpl_2",
      workspaceId: "ws_2",
      name: "Template WS2",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await insertCampaignFixture(db, {
      id: "camp_ws2",
      workspaceId: "ws_2",
      templateId: "tpl_2",
      createdByUserId: "user_2",
      name: "WS2 Campaign",
      status: "draft",
      targetType: "all_contacts",
      targetGroupName: null,
    });

    const app = createTestApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/api/campaigns/camp_ws2/queue",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("fails queueCampaign when target has no active contacts", async () => {
    await insertTemplateFixture(db, {
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    const app = createTestApp();
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
    expect(failureAudits[0]?.workspaceId).toBe("ws_1");
    expect(failureAudits[0]?.actorUserId).toBe("user_1");
    expect(failureAudits[0]?.targetType).toBe("campaign");
    expect(failureAudits[0]?.targetId).toBe(campaignId);

    await app.close();
  });

  it("returns campaign progress and send jobs list", async () => {
    await insertTemplateFixture(db, {
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await insertContactFixture(db, {
      id: "c_1",
      workspaceId: "ws_1",
      email: "alice@example.com",
      name: "Alice",
      customFields: {},
    });
    await insertContactFixture(db, {
      id: "c_2",
      workspaceId: "ws_1",
      email: "bob@example.com",
      name: "Bob",
      customFields: {},
    });

    const app = createTestApp();
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

  it("lists campaigns within workspace and supports status filtering", async () => {
    await insertTemplateFixture(db, {
      id: "tpl_list_1",
      workspaceId: "ws_1",
      name: "Template List 1",
      subject: "Hello {{name}}",
      bodyHtml: "<p>Hello {{name}}</p>",
    });
    await insertTemplateFixture(db, {
      id: "tpl_list_2",
      workspaceId: "ws_2",
      name: "Template List 2",
      subject: "Hi {{name}}",
      bodyHtml: "<p>Hi {{name}}</p>",
    });

    await insertCampaignFixture(db, {
      id: "camp_list_ws1_draft",
      workspaceId: "ws_1",
      templateId: "tpl_list_1",
      createdByUserId: "user_1",
      name: "WS1 Draft",
      status: "draft",
      targetType: "all_contacts",
      targetGroupName: null,
    });
    await insertCampaignFixture(db, {
      id: "camp_list_ws1_queued",
      workspaceId: "ws_1",
      templateId: "tpl_list_1",
      createdByUserId: "user_1",
      name: "WS1 Queued",
      status: "queued",
      targetType: "all_contacts",
      targetGroupName: null,
      queuedAt: new Date(),
    });
    await insertCampaignFixture(db, {
      id: "camp_list_ws2_draft",
      workspaceId: "ws_2",
      templateId: "tpl_list_2",
      createdByUserId: "user_2",
      name: "WS2 Draft",
      status: "draft",
      targetType: "all_contacts",
      targetGroupName: null,
    });

    const app = createTestApp();
    await app.ready();

    const all = await app.inject({
      method: "GET",
      url: "/api/campaigns",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(all.statusCode).toBe(200);
    const allPayload = all.json() as {
      items: Array<{ id: string; workspaceId: string; status: string }>;
      total: number;
    };
    expect(allPayload.total).toBe(2);
    expect(allPayload.items.every((item) => item.workspaceId === "ws_1")).toBe(true);

    const queuedOnly = await app.inject({
      method: "GET",
      url: "/api/campaigns?status=queued",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });
    expect(queuedOnly.statusCode).toBe(200);
    const queuedPayload = queuedOnly.json() as {
      items: Array<{ id: string; status: string }>;
      total: number;
    };
    expect(queuedPayload.total).toBe(1);
    expect(queuedPayload.items[0]?.id).toBe("camp_list_ws1_queued");
    expect(queuedPayload.items[0]?.status).toBe("queued");

    await app.close();
  });

  it("returns recent failed delivery attempts with send job context for operator triage", async () => {
    await insertTemplateFixture(db, {
      id: "tpl_1",
      workspaceId: "ws_1",
      name: "Welcome",
      subject: "Hi {{name}}",
      bodyHtml: "<p>{{name}}</p>",
    });

    await insertContactFixture(db, {
      id: "c_1",
      workspaceId: "ws_1",
      email: "alice@example.com",
      name: "Alice",
      customFields: {},
    });
    await insertContactFixture(db, {
      id: "c_2",
      workspaceId: "ws_1",
      email: "bob@example.com",
      name: "Bob",
      customFields: {},
    });

    await insertCampaignFixture(db, {
      id: "campaign_failures",
      workspaceId: "ws_1",
      templateId: "tpl_1",
      createdByUserId: "user_1",
      name: "Failure Campaign",
      status: "processing",
      targetType: "all_contacts",
      targetGroupName: null,
      queuedAt: new Date(),
    });

    await db.insert(sendJobs).values([
      {
        id: "send_job_failed_terminal",
        workspaceId: "ws_1",
        campaignId: "campaign_failures",
        contactId: "c_1",
        recipientEmail: "alice@example.com",
        recipientName: "Alice",
        renderedSubject: "Hello",
        renderedBody: "<p>Hello</p>",
        status: "failed",
        attemptCount: 3,
        maxAttempts: 3,
        scheduledAt: new Date(Date.now() - 60_000),
        lockedAt: null,
        lockedBy: null,
        processedAt: new Date("2026-04-15T07:00:00.000Z"),
        lastErrorCode: "INVALID_RECIPIENT",
        lastErrorMessage: "Permanent failure",
        provider: "resend",
        providerMessageId: null,
      },
      {
        id: "send_job_pending_retry",
        workspaceId: "ws_1",
        campaignId: "campaign_failures",
        contactId: "c_2",
        recipientEmail: "bob@example.com",
        recipientName: "Bob",
        renderedSubject: "Hello",
        renderedBody: "<p>Hello</p>",
        status: "pending",
        attemptCount: 1,
        maxAttempts: 3,
        scheduledAt: new Date("2026-04-15T08:00:00.000Z"),
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastErrorCode: "RATE_LIMIT",
        lastErrorMessage: "Transient failure",
        provider: "resend",
        providerMessageId: null,
      },
    ]);

    await db.insert(deliveryAttempts).values([
      {
        id: "attempt_old",
        workspaceId: "ws_1",
        sendJobId: "send_job_failed_terminal",
        provider: "resend",
        providerMessageId: null,
        status: "failed",
        errorCode: "INVALID_RECIPIENT",
        errorMessage: "Permanent failure",
        requestPayloadJson: {},
        responsePayloadJson: {},
        requestedAt: new Date("2026-04-15T06:59:00.000Z"),
        completedAt: new Date("2026-04-15T07:00:00.000Z"),
      },
      {
        id: "attempt_new",
        workspaceId: "ws_1",
        sendJobId: "send_job_pending_retry",
        provider: "resend",
        providerMessageId: null,
        status: "failed",
        errorCode: "RATE_LIMIT",
        errorMessage: "Transient failure",
        requestPayloadJson: {},
        responsePayloadJson: {},
        requestedAt: new Date("2026-04-15T07:09:00.000Z"),
        completedAt: new Date("2026-04-15T07:10:00.000Z"),
      },
    ]);

    const app = createTestApp();
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/campaigns/campaign_failures/recent-failures",
      headers: {
        "x-dev-user-id": "user_1",
        "x-dev-workspace-id": "ws_1",
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      items: Array<{
        completedAt: string;
        deliveryAttemptId: string;
        errorCode: string | null;
        recipientEmail: string;
        sendJobId: string;
        sendJobStatus: string;
      }>;
      total: number;
    };

    expect(payload.total).toBe(2);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]?.deliveryAttemptId).toBe("attempt_new");
    expect(payload.items[0]?.sendJobId).toBe("send_job_pending_retry");
    expect(payload.items[0]?.sendJobStatus).toBe("pending");
    expect(payload.items[0]?.errorCode).toBe("RATE_LIMIT");
    expect(payload.items[0]?.recipientEmail).toBe("bob@example.com");
    expect(payload.items[1]?.deliveryAttemptId).toBe("attempt_old");
    expect(payload.items[1]?.sendJobStatus).toBe("failed");

    await app.close();
  });

  it("supports me -> switch-workspace flow with external token auth", async () => {
    await db.insert(workspaceMembers).values({
      workspaceId: "ws_2",
      userId: "user_1",
      role: "admin",
    });

    const app = createApiApp({
      services: {
        db,
        authAdapter: {
          kind: "supabase",
          async authenticate(request) {
            if (request.headers.authorization !== "Bearer test-token") {
              return null;
            }

            const workspaceHeader = request.headers["x-smartsend-workspace-id"];

            return {
              session: {
                id: "supabase:test-user-1",
                userId: "supabase_user_1",
              },
              user: {
                id: "supabase_user_1",
                email: "user1@example.com",
                name: "User One",
              },
              currentWorkspaceId:
                typeof workspaceHeader === "string" ? workspaceHeader : null,
            };
          },
        },
      },
    });
    await app.ready();

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: "Bearer test-token",
      },
    });

    expect(me.statusCode).toBe(200);
    const mePayload = me.json() as {
      sessionId: string;
      user: { email: string };
      currentWorkspaceId: string;
      workspaces: Array<{ workspaceId: string; role: string }>;
    };

    expect(mePayload.sessionId).toBe("supabase:test-user-1");
    expect(mePayload.user.email).toBe("user1@example.com");
    expect(mePayload.currentWorkspaceId).toBe("ws_1");
    expect(mePayload.workspaces).toHaveLength(2);

    const switched = await app.inject({
      method: "POST",
      url: "/api/auth/switch-workspace",
      headers: {
        authorization: "Bearer test-token",
      },
      payload: {
        workspaceId: "ws_2",
      },
    });

    expect(switched.statusCode).toBe(200);
    const switchedPayload = switched.json() as {
      currentWorkspaceId: string;
      currentWorkspaceRole: string;
    };
    expect(switchedPayload.currentWorkspaceId).toBe("ws_2");
    expect(switchedPayload.currentWorkspaceRole).toBe("admin");

    const meAfterSwitch = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: {
        authorization: "Bearer test-token",
        "x-smartsend-workspace-id": "ws_2",
      },
    });

    expect(meAfterSwitch.statusCode).toBe(200);
    expect(meAfterSwitch.json()).toMatchObject({
      currentWorkspaceId: "ws_2",
      currentWorkspaceRole: "admin",
    });

    await app.close();
  });
});
