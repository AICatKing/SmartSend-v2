import { createApiApp } from "./app.js";
import { apiEnv } from "./env.js";

const app = createApiApp();

async function start() {
  try {
    await app.listen({
      host: apiEnv.HOST,
      port: apiEnv.API_PORT,
    });

    const shutdown = async () => {
      await app.close();
      process.exit(0);
    };

    process.once("SIGINT", () => {
      void shutdown();
    });

    process.once("SIGTERM", () => {
      void shutdown();
    });
  } catch (error) {
    app.log.error(error, "Failed to start API process.");
    process.exit(1);
  }
}

void start();
