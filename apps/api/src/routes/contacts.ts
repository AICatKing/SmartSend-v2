import type { FastifyInstance } from "fastify";
import {
  createContact,
  importContacts,
  listContacts,
  removeContact,
  updateContact,
} from "@smartsend/domain";

import { requireApiContext, safeRecordAudit } from "./helpers.js";

export async function registerContactRoutes(
  app: FastifyInstance<any, any, any, any>,
) {
  app.get("/api/contacts", { preHandler: requireApiContext }, async (request) => {
    return listContacts(app.services.requireDatabase(), {
      workspaceId: request.apiContext.currentWorkspaceId,
      query: (request.query as Record<string, unknown> | undefined)?.query,
      groupName: (request.query as Record<string, unknown> | undefined)?.groupName,
      includeDeleted:
        (request.query as Record<string, unknown> | undefined)?.includeDeleted ===
        "true",
      limit: (request.query as Record<string, unknown> | undefined)?.limit,
      offset: (request.query as Record<string, unknown> | undefined)?.offset,
    });
  });

  app.post("/api/contacts", { preHandler: requireApiContext }, async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const output = await createContact(app.services.requireDatabase(), {
      workspaceId: request.apiContext.currentWorkspaceId,
      contact: body.contact ?? body,
    });

    await safeRecordAudit(request, {
      action: "contact.create",
      actorUserId: request.apiContext.user.id,
      workspaceId: request.apiContext.currentWorkspaceId,
      targetType: "contact",
      targetId: output.contact.id,
    });

    return output;
  });

  app.patch(
    "/api/contacts/:contactId",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { contactId: string };

      const output = await updateContact(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        contactId: params.contactId,
        patch: request.body,
      });

      await safeRecordAudit(request, {
        action: "contact.update",
        actorUserId: request.apiContext.user.id,
        workspaceId: request.apiContext.currentWorkspaceId,
        targetType: "contact",
        targetId: output.contact.id,
      });

      return output;
    },
  );

  app.delete(
    "/api/contacts/:contactId",
    { preHandler: requireApiContext },
    async (request) => {
      const params = request.params as { contactId: string };

      const output = await removeContact(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        contactId: params.contactId,
      });

      await safeRecordAudit(request, {
        action: "contact.remove",
        actorUserId: request.apiContext.user.id,
        workspaceId: request.apiContext.currentWorkspaceId,
        targetType: "contact",
        targetId: output.contactId,
      });

      return output;
    },
  );

  app.post(
    "/api/contacts/import",
    { preHandler: requireApiContext },
    async (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;

      const output = await importContacts(app.services.requireDatabase(), {
        workspaceId: request.apiContext.currentWorkspaceId,
        contacts: body.contacts,
      });

      await safeRecordAudit(request, {
        action: "contact.import",
        actorUserId: request.apiContext.user.id,
        workspaceId: request.apiContext.currentWorkspaceId,
        targetType: "contact_batch",
        metadata: {
          importedCount: output.importedCount,
        },
      });

      return output;
    },
  );
}
