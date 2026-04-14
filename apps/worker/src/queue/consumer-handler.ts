import { createLogger } from "@smartsend/shared";
import {
  asyncDeploymentModel,
  asyncExecutionBackend,
  consumerHandlerServiceId,
} from "@smartsend/domain";

import { localAsyncShimEnv } from "../env.js";

const logger = createLogger({
  service: "@smartsend/consumer-handler",
  level: localAsyncShimEnv.LOG_LEVEL,
});

export type ConsumerHandlerEvent = {
  source: "local-shim" | "vercel-queue";
  messageCount: number;
};

export async function handleConsumerEvent(event: ConsumerHandlerEvent) {
  logger.info(
    {
      service: consumerHandlerServiceId,
      deploymentModel: asyncDeploymentModel,
      executionBackend: asyncExecutionBackend,
      source: event.source,
      messageCount: event.messageCount,
    },
    "Consumer handler placeholder invoked. Job processing is intentionally not implemented in Phase 1.",
  );
}
