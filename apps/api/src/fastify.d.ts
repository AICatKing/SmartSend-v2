import "fastify";

import type { ApiRequestContext } from "./auth/index.js";
import type { ApiServices } from "./services.js";

declare module "fastify" {
  interface FastifyInstance {
    services: ApiServices;
  }

  interface FastifyRequest {
    apiContext: ApiRequestContext;
  }
}
