import type { FastifyInstance } from "fastify";
import {
  getWorkspaceSendingConfig,
  upsertWorkspaceSendingConfig,
} from "@smartsend/domain";
import { workspaceSendingConfigUpsertInputSchema } from "@smartsend/contracts";

import { requireApiContext, safeRecordAudit } from "./helpers.js";

export async function registerWorkspaceSendingConfigRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.get(
    "/api/workspace-sending-config",
    { preHandler: requireApiContext },
    async (request) => {
      return getWorkspaceSendingConfig(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
      });
    },
  );

  app.put(
    "/api/workspace-sending-config",
    { preHandler: requireApiContext },
    async (request) => {
      const body = workspaceSendingConfigUpsertInputSchema
        .omit({ workspaceId: true })
        .parse(request.body ?? {});

      const encryptedApiKey =
        body.apiKey !== undefined
          ? app.services.requireSecretBox().encrypt(body.apiKey)
          : undefined;

      return upsertWorkspaceSendingConfig(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        provider: body.provider,
        fromEmail: body.fromEmail,
        fromName: body.fromName,
        replyToEmail: body.replyToEmail ?? null,
        ...(encryptedApiKey !== undefined ? { encryptedApiKey } : {}),
      }).then(async (output) => {
        await safeRecordAudit(request, {
          action: "workspace_sending_config.upsert",
          actorUserId: request.apiContext.user.id,
          workspaceId: request.apiContext.currentWorkspaceId,
          targetType: "workspace_sending_config",
          targetId: request.apiContext.currentWorkspaceId,
          metadata: {
            provider: body.provider,
            hasApiKeyUpdate: body.apiKey !== undefined,
          },
        });

        return output;
      });
    },
  );
}
