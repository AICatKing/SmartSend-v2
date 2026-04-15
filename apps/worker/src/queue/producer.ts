import { createLogger } from "@smartsend/shared";
import { sendJobQueueMessageSchema, type SendJobQueueMessage } from "@smartsend/contracts";
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

export type QueuePublishMessage = SendJobQueueMessage;

export async function publishToAsyncQueue(message: QueuePublishMessage) {
  const parsed = sendJobQueueMessageSchema.parse(message);

  logger.info(
    {
      deploymentModel: asyncDeploymentModel,
      executionBackend: asyncExecutionBackend,
      provider: primaryProvider,
      messageKind: parsed.kind,
      messageVersion: parsed.version,
      sendJobId: parsed.sendJobId,
    },
    "Queue producer adapter recorded a local publish event. Real Vercel Queues delivery is still pending a later work package.",
  );
}
