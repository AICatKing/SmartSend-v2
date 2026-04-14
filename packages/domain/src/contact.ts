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

export type ContactCustomFieldValue = z.infer<typeof contactCustomFieldValueSchema>;
export type ContactCustomFields = z.infer<typeof contactCustomFieldsSchema>;
