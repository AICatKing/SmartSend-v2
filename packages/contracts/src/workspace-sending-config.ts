import { z } from "zod";
import { entityIdSchema, providerSchema } from "./primitives.js";

const isoDateTimeSchema = z.string().datetime();
const senderNameSchema = z.string().trim().min(1).max(200);
const emailAddressSchema = z.string().trim().email().max(320);

export const workspaceSendingConfigSchema = z.object({
  workspaceId: entityIdSchema,
  provider: providerSchema,
  fromEmail: emailAddressSchema,
  fromName: senderNameSchema,
  replyToEmail: emailAddressSchema.optional().nullable(),
  hasApiKey: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const workspaceSendingConfigGetInputSchema = z.object({
  workspaceId: entityIdSchema,
});

export const workspaceSendingConfigGetOutputSchema = z.object({
  config: workspaceSendingConfigSchema.nullable(),
});

export const workspaceSendingConfigUpsertInputSchema = z.object({
  workspaceId: entityIdSchema,
  provider: providerSchema.default("resend"),
  fromEmail: emailAddressSchema,
  fromName: senderNameSchema,
  replyToEmail: emailAddressSchema.optional().nullable(),
  apiKey: z.string().min(1).max(4096).optional(),
});

export const workspaceSendingConfigUpsertOutputSchema = z.object({
  config: workspaceSendingConfigSchema,
});
