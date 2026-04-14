import { z } from "zod";
import {
  contactCustomFieldsSchema,
  contactGroupNameSchema,
  entityIdSchema,
} from "@smartsend/domain";

const isoDateTimeSchema = z.string().datetime();
const emailSchema = z.string().trim().email().max(320);
const nameSchema = z.string().trim().min(1).max(200);
const companySchema = z.string().trim().min(1).max(200);

export const contactSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  email: emailSchema,
  name: nameSchema,
  company: companySchema.optional().nullable(),
  groupName: contactGroupNameSchema.optional().nullable(),
  customFields: contactCustomFieldsSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.optional().nullable(),
});

export const contactListInputSchema = z.object({
  workspaceId: entityIdSchema,
  query: z.string().trim().max(200).optional(),
  groupName: contactGroupNameSchema.optional(),
  includeDeleted: z.boolean().default(false),
  limit: z.number().int().positive().max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const contactListOutputSchema = z.object({
  items: z.array(contactSchema),
  total: z.number().int().min(0),
});

export const contactCreateDataSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  company: companySchema.optional(),
  groupName: contactGroupNameSchema.optional(),
  customFields: contactCustomFieldsSchema.default({}),
});

export const contactCreateInputSchema = z.object({
  workspaceId: entityIdSchema,
  contact: contactCreateDataSchema,
});

export const contactCreateOutputSchema = z.object({
  contact: contactSchema,
});

export const contactUpdatePatchSchema = z
  .object({
    email: emailSchema.optional(),
    name: nameSchema.optional(),
    company: companySchema.nullable().optional(),
    groupName: contactGroupNameSchema.nullable().optional(),
    customFields: contactCustomFieldsSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one contact field must be updated.",
  });

export const contactUpdateInputSchema = z.object({
  workspaceId: entityIdSchema,
  contactId: entityIdSchema,
  patch: contactUpdatePatchSchema,
});

export const contactUpdateOutputSchema = z.object({
  contact: contactSchema,
});

export const contactRemoveInputSchema = z.object({
  workspaceId: entityIdSchema,
  contactId: entityIdSchema,
});

export const contactRemoveOutputSchema = z.object({
  success: z.literal(true),
  contactId: entityIdSchema,
});

export const contactImportItemSchema = contactCreateDataSchema;

export const contactImportInputSchema = z.object({
  workspaceId: entityIdSchema,
  contacts: z.array(contactImportItemSchema).min(1).max(1000),
});

export const contactImportOutputSchema = z.object({
  contacts: z.array(contactSchema),
  importedCount: z.number().int().min(0),
});

export type Contact = z.infer<typeof contactSchema>;
