import { createLogger } from "@smartsend/shared";
import {
  asyncDeploymentModel,
  asyncExecutionBackend,
  primaryProvider,
} from "@smartsend/domain";

import { localAsyncShimEnv } from "../env.js";

const logger = createLogger({
  service: "@smartsend/queue-producer-adapter",
  level: localAsyncShimEnv.LOG_LEVEL,
});

export type QueuePublishMessage = {
  kind: "send-job";
  jobId: string;
};

export async function publishToAsyncQueue(message: QueuePublishMessage) {
  logger.info(
    {
      deploymentModel: asyncDeploymentModel,
      executionBackend: asyncExecutionBackend,
      provider: primaryProvider,
      messageKind: message.kind,
      jobId: message.jobId,
    },
    "Queue producer adapter recorded a local publish event. Real Vercel Queues delivery is still pending a later work package.",
  );
}
