import { z } from "zod";

import { contactGroupNameSchema, entityIdSchema } from "./contact.js";

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

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type CampaignTarget = z.infer<typeof campaignTargetSchema>;
export type SendJobStatus = z.infer<typeof sendJobStatusSchema>;
