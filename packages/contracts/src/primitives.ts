import { z } from "zod";

export const entityIdSchema = z.string().min(1).max(128);

export const contactGroupNameSchema = z.string().trim().min(1).max(120);

export const contactCustomFieldValueSchema = z.union([
  z.string().max(2000),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const contactCustomFieldsSchema = z.record(
  z.string().trim().min(1).max(120),
  contactCustomFieldValueSchema,
);

export const workspaceRoleSchema = z.enum(["owner", "admin", "member"]);

export const providerSchema = z.enum(["resend"]);

export const providerErrorClassificationSchema = z.enum([
  "retryable",
  "non_retryable",
  "unknown",
]);

export const campaignStatusSchema = z.enum([
  "draft",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const campaignTargetTypeSchema = z.enum(["all_contacts", "group_name"]);

export const campaignTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("all_contacts"),
  }),
  z.object({
    type: z.literal("group_name"),
    groupName: contactGroupNameSchema,
  }),
]);

export const sendJobStatusSchema = z.enum([
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);

export const campaignIdSchema = entityIdSchema;

export const templateVariableNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_.-]+$/);

export const templateRenderContextSchema = z.record(
  templateVariableNameSchema,
  contactCustomFieldValueSchema,
);

export const asyncServiceIdSchema = z.enum([
  "api",
  "local-async-shim",
  "consumer-handler",
  "cron-recovery-handler",
]);
