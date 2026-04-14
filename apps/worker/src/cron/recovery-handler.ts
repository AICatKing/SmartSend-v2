import { createLogger } from "@smartsend/shared";
import {
  asyncDeploymentModel,
  cronRecoveryHandlerServiceId,
  scheduledMaintenanceBackend,
} from "@smartsend/domain";

import { localAsyncShimEnv } from "../env.js";

const logger = createLogger({
  service: "@smartsend/cron-recovery-handler",
  level: localAsyncShimEnv.LOG_LEVEL,
});

export type RecoveryHandlerEvent = {
  source: "local-shim" | "vercel-cron";
  reason: "manual-check" | "scheduled-reconciliation";
};

export async function handleRecoveryEvent(event: RecoveryHandlerEvent) {
  logger.info(
    {
      service: cronRecoveryHandlerServiceId,
      deploymentModel: asyncDeploymentModel,
      scheduledBackend: scheduledMaintenanceBackend,
      source: event.source,
      reason: event.reason,
    },
    "Cron recovery handler placeholder invoked. Reconciliation logic is intentionally not implemented in Phase 1.",
  );
}
