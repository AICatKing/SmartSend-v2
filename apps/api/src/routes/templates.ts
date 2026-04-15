import type { FastifyInstance } from "fastify";
import {
  createTemplate,
  listTemplates,
  previewRenderTemplate,
  removeTemplate,
  updateTemplate,
} from "@smartsend/domain";

import { requireApiContext, safeRecordAudit } from "./helpers.js";

export async function registerTemplateRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.get("/api/templates", { preHandler: requireApiContext }, async (request) => {
    return listTemplates(app.services.requireDatabase(), {
      workspaceId: request.apiContext.currentWorkspaceId,
      includeDeleted:
        (request.query as Record<string, unknown> | undefined)?.includeDeleted ===
        "true",
      limit: (request.query as Record<string, unknown> | undefined)?.limit,
      offset: (request.query as Record<string, unknown> | undefined)?.offset,
    });
  });

  app.post("/api/templates", { preHandler: requireApiContext }, async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const output = await createTemplate(app.services.requireDatabase(), {
      workspaceId: request.apiContext.currentWorkspaceId,
      template: body.template ?? body,
    });

    await safeRecordAudit(request, {
      action: "template.create",
      actorUserId: request.apiContext.user.id,
      workspaceId: request.apiContext.currentWorkspaceId,
      targetType: "template",
      targetId: output.template.id,
    });

    return output;
  });

  app.patch(
    "/api/templates/:templateId",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { templateId: string };

      const output = await updateTemplate(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        templateId: params.templateId,
        patch: request.body,
      });

      await safeRecordAudit(request, {
        action: "template.update",
        actorUserId: request.apiContext.user.id,
        workspaceId: request.apiContext.currentWorkspaceId,
        targetType: "template",
        targetId: output.template.id,
      });

      return output;
    },
  );

  app.delete(
    "/api/templates/:templateId",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { templateId: string };

      const output = await removeTemplate(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        templateId: params.templateId,
      });

      await safeRecordAudit(request, {
        action: "template.remove",
        actorUserId: request.apiContext.user.id,
        workspaceId: request.apiContext.currentWorkspaceId,
        targetType: "template",
        targetId: output.templateId,
      });

      return output;
    },
  );

  app.post(
    "/api/templates/preview-render",
    { preHandler: requireApiContext },
    async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      return previewRenderTemplate({
        workspaceId: request.apiContext.currentWorkspaceId,
        template: body.template,
        variables: body.variables,
      });
    },
  );
}
