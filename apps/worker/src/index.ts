import { createLocalAsyncShimApp } from "./app.js";
import { localAsyncShimEnv } from "./env.js";
import { startLocalAsyncShim } from "./runtime/local-shim.js";

const app = createLocalAsyncShimApp();
const runtime = startLocalAsyncShim();

async function start() {
  try {
    await app.listen({
      host: localAsyncShimEnv.HOST,
      port: localAsyncShimEnv.PORT,
    });

    const shutdown = async () => {
      await runtime.stop();
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
    app.log.error(error, "Failed to start local async shim process.");
    process.exit(1);
  }
}

void start();
