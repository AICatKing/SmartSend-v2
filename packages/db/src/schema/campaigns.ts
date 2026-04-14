import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { templates } from "./templates.js";
import { users } from "./users.js";
import { workspaces } from "./workspaces.js";

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const campaignTargetTypeEnum = pgEnum("campaign_target_type", [
  "all_contacts",
  "group_name",
]);

export const campaigns = pgTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    targetType: campaignTargetTypeEnum("target_type").notNull(),
    targetGroupName: text("target_group_name"),
    queuedAt: timestamp("queued_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campaigns_workspace_status_idx").on(table.workspaceId, table.status),
    index("campaigns_workspace_created_at_idx").on(table.workspaceId, table.createdAt),
  ],
);
