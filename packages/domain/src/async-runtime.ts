import { z } from "zod";

export const asyncDeploymentModelSchema = z.enum(["vercel_first"]);
export const asyncExecutionBackendSchema = z.enum(["vercel_queues"]);
export const scheduledMaintenanceBackendSchema = z.enum(["vercel_cron"]);
export const asyncServiceIdSchema = z.enum([
  "api",
  "local-async-shim",
  "consumer-handler",
  "cron-recovery-handler",
]);

export const asyncDeploymentModel = asyncDeploymentModelSchema.enum.vercel_first;
export const asyncExecutionBackend =
  asyncExecutionBackendSchema.enum.vercel_queues;
export const scheduledMaintenanceBackend =
  scheduledMaintenanceBackendSchema.enum.vercel_cron;
export const localAsyncShimServiceId = asyncServiceIdSchema.enum["local-async-shim"];
export const consumerHandlerServiceId =
  asyncServiceIdSchema.enum["consumer-handler"];
export const cronRecoveryHandlerServiceId =
  asyncServiceIdSchema.enum["cron-recovery-handler"];

export type AsyncDeploymentModel = z.infer<typeof asyncDeploymentModelSchema>;
export type AsyncExecutionBackend = z.infer<typeof asyncExecutionBackendSchema>;
export type ScheduledMaintenanceBackend = z.infer<
  typeof scheduledMaintenanceBackendSchema
>;
export type AsyncServiceId = z.infer<typeof asyncServiceIdSchema>;
