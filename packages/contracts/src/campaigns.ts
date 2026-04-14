import { z } from "zod";
import {
  campaignIdSchema,
  campaignStatusSchema,
  campaignTargetSchema,
  sendJobStatusSchema,
} from "../../domain/src/campaign.js";
import { entityIdSchema } from "../../domain/src/contact.js";

const isoDateTimeSchema = z.string().datetime();

const campaignNameSchema = z.string().trim().min(1).max(200);

export const campaignSchema = z.object({
  id: campaignIdSchema,
  workspaceId: entityIdSchema,
  templateId: entityIdSchema,
  createdByUserId: entityIdSchema,
  name: campaignNameSchema,
  status: campaignStatusSchema,
  target: campaignTargetSchema,
  queuedAt: isoDateTimeSchema.optional().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const campaignCreateDraftInputSchema = z.object({
  workspaceId: entityIdSchema,
  templateId: entityIdSchema,
  name: campaignNameSchema,
  target: campaignTargetSchema,
});

export const campaignCreateDraftOutputSchema = z.object({
  campaign: campaignSchema,
});

export const campaignQueueInputSchema = z.object({
  workspaceId: entityIdSchema,
  campaignId: campaignIdSchema,
  maxAttempts: z.number().int().positive().max(20).default(3),
  scheduledAt: isoDateTimeSchema.optional(),
});

export const campaignQueueOutputSchema = z.object({
  campaignId: campaignIdSchema,
  status: z.literal("queued"),
  queuedCount: z.number().int().min(0),
});

export const campaignProgressInputSchema = z.object({
  workspaceId: entityIdSchema,
  campaignId: campaignIdSchema,
});

export const campaignProgressOutputSchema = z.object({
  campaignId: campaignIdSchema,
  status: campaignStatusSchema,
  total: z.number().int().min(0),
  pending: z.number().int().min(0),
  processing: z.number().int().min(0),
  sent: z.number().int().min(0),
  failed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
});

export const campaignSendJobListItemSchema = z.object({
  id: entityIdSchema,
  campaignId: campaignIdSchema,
  contactId: entityIdSchema,
  recipientEmail: z.string().email(),
  recipientName: z.string(),
  status: sendJobStatusSchema,
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1),
  scheduledAt: isoDateTimeSchema,
  processedAt: isoDateTimeSchema.optional().nullable(),
  lastErrorCode: z.string().optional().nullable(),
  lastErrorMessage: z.string().optional().nullable(),
  provider: z.string(),
  providerMessageId: z.string().optional().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const campaignListSendJobsInputSchema = z.object({
  workspaceId: entityIdSchema,
  campaignId: campaignIdSchema,
  limit: z.number().int().positive().max(200).default(100),
  offset: z.number().int().min(0).default(0),
});

export const campaignListSendJobsOutputSchema = z.object({
  items: z.array(campaignSendJobListItemSchema),
  total: z.number().int().min(0),
});
