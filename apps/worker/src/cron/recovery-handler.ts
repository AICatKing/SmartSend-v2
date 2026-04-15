import { createLogger } from "@smartsend/shared";
import {
  asyncDeploymentModel,
  cronRecoveryHandlerServiceId,
  defaultSendJobLockTimeoutMs,
  recoverStuckProcessingSendJobs,
  scheduledMaintenanceBackend,
} from "@smartsend/domain";
import { ConfigError } from "@smartsend/shared";
import { createDatabase } from "@smartsend/db";

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
  if (!localAsyncShimEnv.DATABASE_URL) {
    throw new ConfigError("DATABASE_URL is required for the recovery handler.");
  }

  const { client, db } = createDatabase(localAsyncShimEnv.DATABASE_URL);

  try {
    const summary = await recoverStuckProcessingSendJobs(db, {
      lockTimeoutMs:
        localAsyncShimEnv.SEND_JOB_LOCK_TIMEOUT_MS ?? defaultSendJobLockTimeoutMs,
    });

    logger.info(
      {
        service: cronRecoveryHandlerServiceId,
        deploymentModel: asyncDeploymentModel,
        scheduledBackend: scheduledMaintenanceBackend,
        source: event.source,
        reason: event.reason,
        lockTimeoutMs: localAsyncShimEnv.SEND_JOB_LOCK_TIMEOUT_MS,
        summary,
      },
      "Cron recovery handler completed a reconciliation sweep.",
    );

    return summary;
  } finally {
    await client.end();
  }
}
