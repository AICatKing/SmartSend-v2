import { z } from "zod";
import {
  providerErrorClassificationSchema,
  providerSchema,
} from "../../domain/src/provider.js";
import { sendJobStatusSchema } from "../../domain/src/campaign.js";
import { entityIdSchema } from "../../domain/src/contact.js";

const isoDateTimeSchema = z.string().datetime();

export const deliveryAttemptSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  sendJobId: entityIdSchema,
  provider: providerSchema,
  providerMessageId: z.string().nullable(),
  status: z.enum(["sent", "failed"]),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  requestPayloadJson: z.record(z.string(), z.unknown()),
  responsePayloadJson: z.record(z.string(), z.unknown()),
  requestedAt: isoDateTimeSchema,
  completedAt: isoDateTimeSchema,
});

export const sendJobProcessingResultSchema = z.object({
  sendJobId: entityIdSchema,
  campaignId: entityIdSchema,
  workspaceId: entityIdSchema,
  finalStatus: sendJobStatusSchema,
  classification: providerErrorClassificationSchema.optional(),
  deliveryAttemptId: entityIdSchema,
});

export const processSendJobInputSchema = z.object({
  sendJobId: entityIdSchema,
  lockedBy: z.string().min(1).max(120),
});

export const claimSendJobInputSchema = z.object({
  lockedBy: z.string().min(1).max(120),
  sendJobId: entityIdSchema.optional(),
  workspaceId: entityIdSchema.optional(),
});
