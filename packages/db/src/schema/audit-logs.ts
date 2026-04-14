import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_workspace_action_idx").on(table.workspaceId, table.action),
  ],
);
