import type { FastifyBaseLogger } from "fastify";
import { auditLogs, type Database } from "@smartsend/db";

export type PendingAuditEvent = {
  action: string;
  actorUserId: string;
  metadata?: Record<string, unknown>;
  workspaceId: string;
  targetId?: string;
  targetType: string;
};

export interface AuditAdapter {
  readonly implemented: boolean;
  record(event: PendingAuditEvent): Promise<void>;
}

export function createPendingAuditAdapter(logger: FastifyBaseLogger): AuditAdapter {
  logger.warn(
    "audit_logs table is not implemented yet; contact/template/settings mutations are currently not audited.",
  );

  return {
    implemented: false,
    async record(event) {
      logger.debug(
        {
          auditImplemented: false,
          event,
        },
        "Skipped audit event because audit_logs is not implemented yet.",
      );
    },
  };
}

export function createDatabaseAuditAdapter(
  db: Database,
  logger: FastifyBaseLogger,
): AuditAdapter {
  return {
    implemented: true,
    async record(event) {
      await db.insert(auditLogs).values({
        id: `audit_${crypto.randomUUID()}`,
        workspaceId: event.workspaceId,
        actorUserId: event.actorUserId,
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId ?? null,
        metadata: event.metadata ?? {},
      });

      logger.debug(
        {
          action: event.action,
          workspaceId: event.workspaceId,
          targetId: event.targetId,
          targetType: event.targetType,
        },
        "Audit event recorded.",
      );
    },
  };
}
