import { z } from "zod";

import { contactCustomFieldValueSchema } from "./contact.js";

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

export type TemplateRenderContext = z.infer<typeof templateRenderContextSchema>;
