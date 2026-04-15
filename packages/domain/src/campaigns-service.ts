import { AppError } from "@smartsend/shared";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import {
  campaignCreateDraftInputSchema,
  campaignCreateDraftOutputSchema,
  campaignListInputSchema,
  campaignListOutputSchema,
  campaignListRecentFailuresInputSchema,
  campaignListRecentFailuresOutputSchema,
  campaignListSendJobsInputSchema,
  campaignListSendJobsOutputSchema,
  campaignProgressInputSchema,
  campaignProgressOutputSchema,
  campaignQueueInputSchema,
  campaignQueueOutputSchema,
  campaignSchema,
  campaignSendJobListItemSchema,
} from "@smartsend/contracts";
import {
  campaigns,
  contacts,
  deliveryAttempts,
  sendJobs,
  templates,
  type Database,
} from "@smartsend/db";

import { writeAuditLog } from "./audit-service.js";
import { renderTemplateWithVariables } from "./template-render.js";

const createCampaignId = () => `campaign_${crypto.randomUUID()}`;
const createSendJobId = () => `send_job_${crypto.randomUUID()}`;

type QueueCampaignInput = {
  actorUserId: string;
  campaignId: string;
  maxAttempts?: number;
  scheduledAt?: string;
  workspaceId: string;
};

type CreateCampaignDraftInput = {
  actorUserId: string;
  name: string;
  target: unknown;
  templateId: string;
  workspaceId: string;
};

export async function createCampaignDraft(
  db: Database,
  input: CreateCampaignDraftInput,
) {
  const parsed = campaignCreateDraftInputSchema.parse({
    workspaceId: input.workspaceId,
    templateId: input.templateId,
    name: input.name,
    target: input.target,
  });
  const actorUserId = input.actorUserId;

  const [template] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(
      and(
        eq(templates.id, parsed.templateId),
        eq(templates.workspaceId, parsed.workspaceId),
        isNull(templates.deletedAt),
      ),
    )
    .limit(1);

  if (!template) {
    throw new AppError("NOT_FOUND", "Template not found.");
  }

  const [created] = await db
    .insert(campaigns)
    .values({
      id: createCampaignId(),
      workspaceId: parsed.workspaceId,
      templateId: parsed.templateId,
      createdByUserId: actorUserId,
      name: parsed.name,
      status: "draft",
      targetType: parsed.target.type,
      targetGroupName:
        parsed.target.type === "group_name" ? parsed.target.groupName : null,
    })
    .returning();

  const createdCampaign = assertFound(created);

  await writeAuditLog(db, {
    action: "campaign.createDraft",
    actorUserId,
    targetType: "campaign",
    targetId: createdCampaign.id,
    workspaceId: parsed.workspaceId,
    metadata: {
      target: parsed.target,
    },
  });

  return campaignCreateDraftOutputSchema.parse({
    campaign: toCampaignDto(createdCampaign),
  });
}

export async function listCampaigns(db: Database, input: unknown) {
  const parsed = campaignListInputSchema.parse(input);

  const whereClause = parsed.status
    ? and(
        eq(campaigns.workspaceId, parsed.workspaceId),
        eq(campaigns.status, parsed.status),
      )
    : eq(campaigns.workspaceId, parsed.workspaceId);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(campaigns)
      .where(whereClause)
      .orderBy(sql`${campaigns.createdAt} desc`)
      .limit(parsed.limit)
      .offset(parsed.offset),
    db
      .select({ total: count() })
      .from(campaigns)
      .where(whereClause),
  ]);

  return campaignListOutputSchema.parse({
    items: items.map((item) => toCampaignDto(item)),
    total: totalRows[0]?.total ?? 0,
  });
}

export async function queueCampaign(db: Database, input: QueueCampaignInput) {
  const parsed = campaignQueueInputSchema.parse(input);
  const scheduledAt = parsed.scheduledAt
    ? new Date(parsed.scheduledAt)
    : new Date();

  if (Number.isNaN(scheduledAt.valueOf())) {
    throw new AppError("VALIDATION_ERROR", "scheduledAt is invalid.");
  }

  const result = await db.transaction(async (tx) => {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, parsed.campaignId),
          eq(campaigns.workspaceId, parsed.workspaceId),
        ),
      )
      .limit(1);

    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campaign not found.");
    }

    if (campaign.status !== "draft") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Only draft campaign can be queued.",
        {
          details: {
            campaignId: campaign.id,
            status: campaign.status,
          },
        },
      );
    }

    const [template] = await tx
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, campaign.templateId),
          eq(templates.workspaceId, campaign.workspaceId),
          isNull(templates.deletedAt),
        ),
      )
      .limit(1);

    if (!template) {
      throw new AppError("NOT_FOUND", "Template not found for campaign.");
    }

    const targetContacts = await resolveTargetContacts(tx, campaign);

    if (targetContacts.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "No active contacts matched campaign target.",
        {
          details: {
            campaignId: campaign.id,
            targetType: campaign.targetType,
            targetGroupName: campaign.targetGroupName,
          },
        },
      );
    }

    const jobsToInsert = targetContacts.map((contact) => {
      const mergedVariables = {
        name: contact.name,
        email: contact.email,
        company: contact.company,
        group_name: contact.groupName,
        ...contact.customFields,
      } as Record<string, string | number | boolean | null>;

      const subject = renderTemplateWithVariables(
        template.subject,
        mergedVariables,
        "error",
      );
      const body = renderTemplateWithVariables(
        template.bodyHtml,
        mergedVariables,
        "error",
      );

      const missing = [
        ...new Set([...subject.missingVariables, ...body.missingVariables]),
      ];

      if (missing.length > 0) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Campaign template has missing variables for target contacts.",
          {
            details: {
              campaignId: campaign.id,
              contactId: contact.id,
              missingVariables: missing,
            },
          },
        );
      }

      return {
        id: createSendJobId(),
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        recipientEmail: contact.email,
        recipientName: contact.name,
        renderedSubject: subject.rendered,
        renderedBody: body.rendered,
        status: "pending" as const,
        attemptCount: 0,
        maxAttempts: parsed.maxAttempts,
        scheduledAt,
        lockedAt: null,
        lockedBy: null,
        processedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        provider: "resend" as const,
        providerMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await tx.insert(sendJobs).values(jobsToInsert);

    await tx
      .update(campaigns)
      .set({
        status: "queued",
        queuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    await writeAuditLog(tx, {
      action: "campaign.queueCampaign",
      actorUserId: input.actorUserId,
      targetType: "campaign",
      targetId: campaign.id,
      workspaceId: campaign.workspaceId,
      metadata: {
        queuedCount: jobsToInsert.length,
        maxAttempts: parsed.maxAttempts,
        scheduledAt: scheduledAt.toISOString(),
        targetType: campaign.targetType,
        targetGroupName: campaign.targetGroupName,
      },
    });

    return {
      campaignId: campaign.id,
      status: "queued" as const,
      queuedCount: jobsToInsert.length,
    };
  });

  return campaignQueueOutputSchema.parse(result);
}

export async function getCampaignProgress(db: Database, input: unknown) {
  const parsed = campaignProgressInputSchema.parse(input);

  const [campaign] = await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, parsed.campaignId),
        eq(campaigns.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const rows = await db
    .select({
      status: sendJobs.status,
      total: count(),
    })
    .from(sendJobs)
    .where(
      and(
        eq(sendJobs.workspaceId, parsed.workspaceId),
        eq(sendJobs.campaignId, parsed.campaignId),
      ),
    )
    .groupBy(sendJobs.status);

  const grouped = new Map(rows.map((row) => [row.status, row.total]));

  const response = {
    campaignId: campaign.id,
    status: campaign.status,
    total: rows.reduce((acc, row) => acc + row.total, 0),
    pending: grouped.get("pending") ?? 0,
    processing: grouped.get("processing") ?? 0,
    sent: grouped.get("sent") ?? 0,
    failed: grouped.get("failed") ?? 0,
    cancelled: grouped.get("cancelled") ?? 0,
  };

  return campaignProgressOutputSchema.parse(response);
}

export async function listCampaignSendJobs(db: Database, input: unknown) {
  const parsed = campaignListSendJobsInputSchema.parse(input);

  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, parsed.campaignId),
        eq(campaigns.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(sendJobs)
      .where(
        and(
          eq(sendJobs.workspaceId, parsed.workspaceId),
          eq(sendJobs.campaignId, parsed.campaignId),
        ),
      )
      .orderBy(sql`${sendJobs.createdAt} desc`)
      .limit(parsed.limit)
      .offset(parsed.offset),
    db
      .select({ total: count() })
      .from(sendJobs)
      .where(
        and(
          eq(sendJobs.workspaceId, parsed.workspaceId),
          eq(sendJobs.campaignId, parsed.campaignId),
        ),
      ),
  ]);

  return campaignListSendJobsOutputSchema.parse({
    items: items.map((item) =>
      campaignSendJobListItemSchema.parse({
        id: item.id,
        campaignId: item.campaignId,
        contactId: item.contactId,
        recipientEmail: item.recipientEmail,
        recipientName: item.recipientName,
        status: item.status,
        attemptCount: item.attemptCount,
        maxAttempts: item.maxAttempts,
        scheduledAt: item.scheduledAt.toISOString(),
        processedAt: item.processedAt?.toISOString() ?? null,
        lastErrorCode: item.lastErrorCode,
        lastErrorMessage: item.lastErrorMessage,
        provider: item.provider,
        providerMessageId: item.providerMessageId,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }),
    ),
    total: totalRows[0]?.total ?? 0,
  });
}

export async function listCampaignRecentFailures(db: Database, input: unknown) {
  const parsed = campaignListRecentFailuresInputSchema.parse(input);

  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, parsed.campaignId),
        eq(campaigns.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);

  if (!campaign) {
    throw new AppError("NOT_FOUND", "Campaign not found.");
  }

  const whereClause = and(
    eq(sendJobs.workspaceId, parsed.workspaceId),
    eq(sendJobs.campaignId, parsed.campaignId),
    eq(deliveryAttempts.status, "failed"),
  );

  const [items, totalRows] = await Promise.all([
    db
      .select({
        deliveryAttemptId: deliveryAttempts.id,
        sendJobId: sendJobs.id,
        campaignId: sendJobs.campaignId,
        contactId: sendJobs.contactId,
        recipientEmail: sendJobs.recipientEmail,
        recipientName: sendJobs.recipientName,
        sendJobStatus: sendJobs.status,
        attemptCount: sendJobs.attemptCount,
        maxAttempts: sendJobs.maxAttempts,
        scheduledAt: sendJobs.scheduledAt,
        processedAt: sendJobs.processedAt,
        errorCode: deliveryAttempts.errorCode,
        errorMessage: deliveryAttempts.errorMessage,
        provider: deliveryAttempts.provider,
        providerMessageId: deliveryAttempts.providerMessageId,
        requestedAt: deliveryAttempts.requestedAt,
        completedAt: deliveryAttempts.completedAt,
      })
      .from(deliveryAttempts)
      .innerJoin(sendJobs, eq(sendJobs.id, deliveryAttempts.sendJobId))
      .where(whereClause)
      .orderBy(sql`${deliveryAttempts.completedAt} desc`)
      .limit(parsed.limit)
      .offset(parsed.offset),
    db
      .select({ total: count() })
      .from(deliveryAttempts)
      .innerJoin(sendJobs, eq(sendJobs.id, deliveryAttempts.sendJobId))
      .where(whereClause),
  ]);

  return campaignListRecentFailuresOutputSchema.parse({
    items: items.map((item) => ({
      deliveryAttemptId: item.deliveryAttemptId,
      sendJobId: item.sendJobId,
      campaignId: item.campaignId,
      contactId: item.contactId,
      recipientEmail: item.recipientEmail,
      recipientName: item.recipientName,
      sendJobStatus: item.sendJobStatus,
      attemptCount: item.attemptCount,
      maxAttempts: item.maxAttempts,
      scheduledAt: item.scheduledAt.toISOString(),
      processedAt: item.processedAt?.toISOString() ?? null,
      errorCode: item.errorCode,
      errorMessage: item.errorMessage,
      provider: item.provider,
      providerMessageId: item.providerMessageId,
      requestedAt: item.requestedAt.toISOString(),
      completedAt: item.completedAt.toISOString(),
    })),
    total: totalRows[0]?.total ?? 0,
  });
}

async function resolveTargetContacts(
  db: Pick<Database, "select">,
  campaign: typeof campaigns.$inferSelect,
) {
  if (campaign.targetType === "all_contacts") {
    return db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, campaign.workspaceId),
          isNull(contacts.deletedAt),
        ),
      );
  }

  if (!campaign.targetGroupName) {
    throw new AppError("VALIDATION_ERROR", "Campaign target group_name is missing.");
  }

  return db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, campaign.workspaceId),
        eq(contacts.groupName, campaign.targetGroupName),
        isNull(contacts.deletedAt),
      ),
    );
}

function toCampaignDto(row: typeof campaigns.$inferSelect) {
  if (row.targetType === "group_name" && !row.targetGroupName) {
    throw new AppError(
      "DEPENDENCY_ERROR",
      "Campaign target group_name is missing in stored data.",
    );
  }

  const target =
    row.targetType === "all_contacts"
      ? { type: "all_contacts" as const }
      : {
          type: "group_name" as const,
          groupName: row.targetGroupName,
        };

  return campaignSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    templateId: row.templateId,
    createdByUserId: row.createdByUserId,
    name: row.name,
    status: row.status,
    target,
    queuedAt: row.queuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function assertFound<T>(value: T | undefined): T {
  if (!value) {
    throw new AppError("DEPENDENCY_ERROR", "Expected record not returned from database.");
  }

  return value;
}
