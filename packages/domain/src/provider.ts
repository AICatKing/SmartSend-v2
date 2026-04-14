import { z } from "zod";

export const providerSchema = z.enum(["resend"]);
export const providerErrorClassificationSchema = z.enum([
  "retryable",
  "non_retryable",
  "unknown",
]);

export const primaryProvider = providerSchema.enum.resend;

export type Provider = z.infer<typeof providerSchema>;
export type ProviderErrorClassification = z.infer<
  typeof providerErrorClassificationSchema
>;
