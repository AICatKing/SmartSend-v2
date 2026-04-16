import Fastify from "fastify";
import {
  AppError,
  createLogger,
  formatUnknownError,
} from "@smartsend/shared";
import { healthResponseSchema } from "@smartsend/contracts";
import { checkDatabaseConnection } from "@smartsend/db";

import { apiEnv } from "./env.js";
import { registerApiRoutes } from "./routes/index.js";
import { createApiServices, type ApiServices } from "./services.js";

type CreateApiAppOptions = {
  includeLegacyFrontend?: boolean;
  services?: Partial<Parameters<typeof createApiServices>[0]>;
};

export function createApiApp(options: CreateApiAppOptions = {}) {
  const logger = createLogger({
    service: "@smartsend/api",
    level: apiEnv.LOG_LEVEL,
  });

  const app = Fastify({
    logger,
    disableRequestLogging: apiEnv.NODE_ENV === "test",
  });

  const services = createApiServices({
    logger: app.log,
    ...options.services,
  });

  app.decorate("services", services);

  app.setErrorHandler((error, request, reply) => {
    const appError =
      error instanceof AppError
        ? error
        : new AppError("INTERNAL_ERROR", "Unexpected API error.", {
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
    service: "api",
    status: "ready",
  }));

  const healthHandler = async (_: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) => {
    const database = await getDatabaseHealth();

    const response = healthResponseSchema.parse({
      service: "api",
      status: database.status === "up" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: "phase-6-a",
      database,
    });

    return reply.status(response.status === "ok" ? 200 : 503).send(response);
  };

  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  void registerApiRoutes(
    app,
    options.includeLegacyFrontend === undefined
      ? {}
      : {
          includeLegacyFrontend: options.includeLegacyFrontend,
        },
  );

  app.addHook("onClose", async () => {
    await services.close();
  });

  return app;
}

async function getDatabaseHealth() {
  if (!apiEnv.DATABASE_URL) {
    return {
      status: "down" as const,
      details: "DATABASE_URL is not configured.",
    };
  }

  try {
    await checkDatabaseConnection(apiEnv.DATABASE_URL);

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
