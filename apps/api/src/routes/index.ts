import type { FastifyInstance } from "fastify";

import { registerAuthRoutes } from "./auth.js";
import { registerCampaignRoutes } from "./campaigns.js";
import { registerContactRoutes } from "./contacts.js";
import { registerFrontendRoutes } from "./frontend.js";
import { registerTemplateRoutes } from "./templates.js";
import { registerWorkspaceSendingConfigRoutes } from "./workspace-sending-config.js";

export async function registerApiRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  await registerFrontendRoutes(app);
  await registerAuthRoutes(app);
  await registerCampaignRoutes(app);
  await registerContactRoutes(app);
  await registerTemplateRoutes(app);
  await registerWorkspaceSendingConfigRoutes(app);
}
