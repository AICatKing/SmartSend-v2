import type { FastifyReply, FastifyRequest } from "fastify";

import type { PendingAuditEvent } from "../audit/audit-adapter.js";
import { resolveApiRequestContext } from "../context.js";

export async function requireApiContext(
  request: FastifyRequest,
  _reply: FastifyReply,
) {
  request.apiContext = await resolveApiRequestContext(request.server.services, request);
}

export async function safeRecordAudit(
  request: FastifyRequest,
  event: PendingAuditEvent,
) {
  try {
    await request.server.services.auditAdapter.record(event);
  } catch (error) {
    request.log.warn(
      {
        action: event.action,
        workspaceId: event.workspaceId,
        targetType: event.targetType,
        targetId: event.targetId,
        error,
      },
      "Audit event write failed; request result is kept.",
    );
  }
}
