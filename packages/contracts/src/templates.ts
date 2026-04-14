import { z } from "zod";
import { entityIdSchema, templateRenderContextSchema } from "@smartsend/domain";

const isoDateTimeSchema = z.string().datetime();
const templateNameSchema = z.string().trim().min(1).max(200);
const templateSubjectSchema = z.string().trim().min(1).max(998);
const templateBodyHtmlSchema = z.string().trim().min(1).max(100000);

export const templateSchema = z.object({
  id: entityIdSchema,
  workspaceId: entityIdSchema,
  name: templateNameSchema,
  subject: templateSubjectSchema,
  bodyHtml: templateBodyHtmlSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  deletedAt: isoDateTimeSchema.optional().nullable(),
});

export const templateListInputSchema = z.object({
  workspaceId: entityIdSchema,
  includeDeleted: z.boolean().default(false),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

export const templateListOutputSchema = z.object({
  items: z.array(templateSchema),
  total: z.number().int().min(0),
});

export const templateCreateDataSchema = z.object({
  name: templateNameSchema,
  subject: templateSubjectSchema,
  bodyHtml: templateBodyHtmlSchema,
});

export const templateCreateInputSchema = z.object({
  workspaceId: entityIdSchema,
  template: templateCreateDataSchema,
});

export const templateCreateOutputSchema = z.object({
  template: templateSchema,
});

export const templateUpdatePatchSchema = z
  .object({
    name: templateNameSchema.optional(),
    subject: templateSubjectSchema.optional(),
    bodyHtml: templateBodyHtmlSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one template field must be updated.",
  });

export const templateUpdateInputSchema = z.object({
  workspaceId: entityIdSchema,
  templateId: entityIdSchema,
  patch: templateUpdatePatchSchema,
});

export const templateUpdateOutputSchema = z.object({
  template: templateSchema,
});

export const templateRemoveInputSchema = z.object({
  workspaceId: entityIdSchema,
  templateId: entityIdSchema,
});

export const templateRemoveOutputSchema = z.object({
  success: z.literal(true),
  templateId: entityIdSchema,
});

export const templatePreviewRenderInputSchema = z.object({
  workspaceId: entityIdSchema,
  template: templateCreateDataSchema,
  variables: templateRenderContextSchema,
});

export const templatePreviewRenderOutputSchema = z.object({
  renderedSubject: z.string(),
  renderedBodyHtml: z.string(),
  missingVariables: z.array(z.string()),
});

export type Template = z.infer<typeof templateSchema>;
