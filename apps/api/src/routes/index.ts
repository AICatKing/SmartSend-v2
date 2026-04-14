import type { FastifyInstance } from "fastify";

import { registerCampaignRoutes } from "./campaigns.js";
import { registerContactRoutes } from "./contacts.js";
import { registerTemplateRoutes } from "./templates.js";
import { registerWorkspaceSendingConfigRoutes } from "./workspace-sending-config.js";

export async function registerApiRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  await registerCampaignRoutes(app);
  await registerContactRoutes(app);
  await registerTemplateRoutes(app);
  await registerWorkspaceSendingConfigRoutes(app);
}
