import Fastify from "fastify";
import {
  AppError,
  createLogger,
  formatUnknownError,
} from "@smartsend/shared";
import { healthResponseSchema } from "@smartsend/contracts";
import { checkDatabaseConnection } from "@smartsend/db";
import { localAsyncShimServiceId } from "@smartsend/domain";
import { z } from "zod";

import { localAsyncShimEnv } from "./env.js";
import { handleRecoveryEvent } from "./cron/recovery-handler.js";
import { handleConsumerEvent } from "./queue/consumer-handler.js";

const internalConsumeOnceBodySchema = z.object({
  messageCount: z.coerce.number().int().positive().max(100).default(1),
});

export function createLocalAsyncShimApp() {
  const logger = createLogger({
    service: "@smartsend/local-async-shim",
    level: localAsyncShimEnv.LOG_LEVEL,
  });

  const app = Fastify({
    logger,
    disableRequestLogging: localAsyncShimEnv.NODE_ENV === "test",
  });

  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "Unexpected local async shim error.", {
            cause: error,
          });

    request.log.error(
      {
        code: appError.code,
        details: appError.details,
        cause: formatUnknownError(appError.cause),
      },
      appError.message,
    );

    reply.status(appError.statusCode).send({
      error: {
        code: appError.code,
        message: appError.message,
      },
    });
  });

  app.get("/", async () => ({
    service: localAsyncShimServiceId,
    mode: "development-shim",
    status: "ready",
  }));

  app.get("/health", async (_, reply) => {
    const database = await getDatabaseHealth();

    const response = healthResponseSchema.parse({
      service: localAsyncShimServiceId,
      status: database.status === "up" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: "phase-6-a",
      database,
    });

    return reply.status(response.status === "ok" ? 200 : 503).send(response);
  });

  if (localAsyncShimEnv.NODE_ENV !== "production") {
    app.post("/internal/consume-once", async (request, reply) => {
      const internalHeader = request.headers["x-smartsend-internal-dev"];

      if (internalHeader !== "true") {
        throw new AppError(
          "FORBIDDEN",
          "This internal development route requires x-smartsend-internal-dev: true.",
        );
      }

      const body = internalConsumeOnceBodySchema.parse(request.body ?? {});
      const summary = await handleConsumerEvent({
        source: "local-shim",
        messageCount: body.messageCount,
      });

      return reply.status(200).send({
        mode: "development-only",
        summary,
      });
    });

    app.post("/internal/recover-once", async (request, reply) => {
      const internalHeader = request.headers["x-smartsend-internal-dev"];

      if (internalHeader !== "true") {
        throw new AppError(
          "FORBIDDEN",
          "This internal development route requires x-smartsend-internal-dev: true.",
        );
      }

      const summary = await handleRecoveryEvent({
        source: "local-shim",
        reason: "manual-check",
      });

      return reply.status(200).send({
        mode: "development-only",
        summary,
      });
    });
  }

  return app;
}

async function getDatabaseHealth() {
  if (!localAsyncShimEnv.DATABASE_URL) {
    return {
      status: "down" as const,
      details: "DATABASE_URL is not configured.",
    };
  }

  try {
    await checkDatabaseConnection(localAsyncShimEnv.DATABASE_URL);

    return {
      status: "up" as const,
    };
  } catch (error) {
    const formatted = formatUnknownError(error);

    return {
      status: "down" as const,
      details: formatted.message,
    };
  }
}
