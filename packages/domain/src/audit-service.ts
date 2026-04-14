import { auditLogs } from "@smartsend/db";

export type WriteAuditLogInput = {
  action: string;
  actorUserId: string;
  metadata?: Record<string, unknown>;
  targetId?: string;
  targetType: string;
  workspaceId: string;
};

type AuditInsertDb = {
  insert: (table: typeof auditLogs) => {
    values: (value: typeof auditLogs.$inferInsert) => Promise<unknown>;
  };
};

export async function writeAuditLog(db: AuditInsertDb, input: WriteAuditLogInput) {
  await db.insert(auditLogs).values({
    id: `audit_${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}
