import type { FastifyInstance } from "fastify";
import { AppError } from "@smartsend/shared";
import {
  createCampaignDraft,
  getCampaignProgress,
  listCampaignRecentFailures,
  listCampaignSendJobs,
  queueCampaign,
} from "@smartsend/domain";

import { requireApiContext } from "./helpers.js";

export async function registerCampaignRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.post(
    "/api/campaigns/drafts",
    { preHandler: requireApiContext },
    async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      return createCampaignDraft(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        templateId: body.templateId as string,
        name: body.name as string,
        target: body.target,
        actorUserId: request.apiContext.user.id,
      });
    },
  );

  app.post(
    "/api/campaigns/:campaignId/queue",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { campaignId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;

      try {
        return await queueCampaign(app.services.requireDatabase(), {
          actorUserId: request.apiContext.user.id,
          workspaceId: request.apiContext.currentWorkspaceId,
          campaignId: params.campaignId,
          ...(body.maxAttempts !== undefined
            ? { maxAttempts: body.maxAttempts as number }
            : {}),
          ...(body.scheduledAt !== undefined
            ? { scheduledAt: body.scheduledAt as string }
            : {}),
        });
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError("INTERNAL_ERROR", "Unexpected queueCampaign failure.", {
                cause: error,
              });

        await app.services.auditAdapter.record({
          action: "campaign.queueCampaign.failed",
          actorUserId: request.apiContext.user.id,
          workspaceId: request.apiContext.currentWorkspaceId,
          targetType: "campaign",
          targetId: params.campaignId,
          metadata: {
            code: appError.code,
            message: appError.message,
            details: appError.details,
          },
        });

        throw appError;
      }
    },
  );

  app.get(
    "/api/campaigns/:campaignId/progress",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { campaignId: string };

      return getCampaignProgress(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        campaignId: params.campaignId,
      });
    },
  );

  app.get(
    "/api/campaigns/:campaignId/send-jobs",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { campaignId: string };
      const query = (request.query ?? {}) as Record<string, unknown>;

      return listCampaignSendJobs(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        campaignId: params.campaignId,
        limit: query.limit,
        offset: query.offset,
      });
    },
  );

  app.get(
    "/api/campaigns/:campaignId/recent-failures",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { campaignId: string };
      const query = (request.query ?? {}) as Record<string, unknown>;

      return listCampaignRecentFailures(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        campaignId: params.campaignId,
        limit: query.limit,
        offset: query.offset,
      });
    },
  );
}
