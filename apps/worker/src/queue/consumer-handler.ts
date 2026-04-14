import { createDatabase } from "@smartsend/db";
import {
  claimSendJobForProcessing,
  processSendJob,
  asyncDeploymentModel,
  asyncExecutionBackend,
  consumerHandlerServiceId,
} from "@smartsend/domain";
import { ConfigError, createLogger, createSecretBox, formatUnknownError } from "@smartsend/shared";

import { localAsyncShimEnv } from "../env.js";
import { createResendProviderAdapter } from "../provider/resend-adapter.js";

const logger = createLogger({
  service: "@smartsend/consumer-handler",
  level: localAsyncShimEnv.LOG_LEVEL,
});

export type ConsumerProcessingSummary = {
  claimedCount: number;
  failedCount: number;
  providerMode: typeof localAsyncShimEnv.PROVIDER_MODE;
  requeuedCount: number;
  sentCount: number;
};

export type ConsumerHandlerEvent = {
  source: "local-shim" | "vercel-queue";
  messageCount: number;
};

export async function handleConsumerEvent(
  event: ConsumerHandlerEvent,
): Promise<ConsumerProcessingSummary> {
  if (!localAsyncShimEnv.DATABASE_URL) {
    throw new ConfigError("DATABASE_URL is required for the consumer handler.");
  }

  if (!localAsyncShimEnv.API_ENCRYPTION_KEY) {
    throw new ConfigError("API_ENCRYPTION_KEY is required for the consumer handler.");
  }

  const { client, db } = createDatabase(localAsyncShimEnv.DATABASE_URL);
  const providerAdapter = createResendProviderAdapter({
    mode: localAsyncShimEnv.PROVIDER_MODE,
    secretBox: createSecretBox(localAsyncShimEnv.API_ENCRYPTION_KEY),
  });
  const maxClaims = Math.max(1, event.messageCount);

  let claimedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let requeuedCount = 0;

  try {
    for (let index = 0; index < maxClaims; index += 1) {
      const lockedBy = `${consumerHandlerServiceId}:${event.source}:${crypto.randomUUID()}`;
      const claimed = await claimSendJobForProcessing(db, {
        lockedBy,
      });

      if (!claimed) {
        break;
      }

      claimedCount += 1;

      try {
        const result = await processSendJob(db, {
          sendJobId: claimed.id,
          lockedBy,
          providerAdapter,
        });

        if (result.finalStatus === "sent") {
          sentCount += 1;
        } else if (result.finalStatus === "failed") {
          failedCount += 1;
        } else if (result.finalStatus === "pending") {
          requeuedCount += 1;
        }
      } catch (error) {
        const formatted = formatUnknownError(error);
        logger.error(
          {
            source: event.source,
            sendJobId: claimed.id,
            error: formatted,
          },
          "Consumer handler failed while processing a claimed send job.",
        );
        throw error;
      }
    }

    logger.info(
      {
        service: consumerHandlerServiceId,
        deploymentModel: asyncDeploymentModel,
        executionBackend: asyncExecutionBackend,
        source: event.source,
        messageCount: event.messageCount,
        claimedCount,
        sentCount,
        failedCount,
        requeuedCount,
        providerMode: localAsyncShimEnv.PROVIDER_MODE,
      },
      "Consumer handler completed a polling cycle.",
    );

    return {
      claimedCount,
      sentCount,
      failedCount,
      requeuedCount,
      providerMode: localAsyncShimEnv.PROVIDER_MODE,
    };
  } finally {
    await client.end();
  }
}
