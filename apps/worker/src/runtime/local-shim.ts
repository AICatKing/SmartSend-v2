import { createLogger } from "@smartsend/shared";
import {
  asyncDeploymentModel,
  asyncExecutionBackend,
  cronRecoveryHandlerServiceId,
  localAsyncShimServiceId,
  scheduledMaintenanceBackend,
} from "@smartsend/domain";

import { localAsyncShimEnv } from "../env.js";
import { handleRecoveryEvent } from "../cron/recovery-handler.js";
import { handleConsumerEvent } from "../queue/consumer-handler.js";

export function startLocalAsyncShim() {
  const logger = createLogger({
    service: "@smartsend/local-async-shim",
    level: localAsyncShimEnv.LOG_LEVEL,
  });

  logger.info(
    {
      service: localAsyncShimServiceId,
      deploymentModel: asyncDeploymentModel,
      executionBackend: asyncExecutionBackend,
      scheduledBackend: scheduledMaintenanceBackend,
      shimTargets: ["consumer-handler", cronRecoveryHandlerServiceId],
    },
    "Local async shim initialized. It exists only for development and mirrors future Vercel handler boundaries.",
  );

  return {
    async simulateConsumerPoll(messageCount = 1) {
      return handleConsumerEvent({
        source: "local-shim",
        messageCount,
      });
    },
    async simulateRecoverySweep() {
      await handleRecoveryEvent({
        source: "local-shim",
        reason: "manual-check",
      });
    },
    async stop() {
      logger.info("Local async shim stopped.");
    },
  };
}
