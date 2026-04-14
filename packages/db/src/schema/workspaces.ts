import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./users.js";

const workspaceRoleValues = ["owner", "admin", "member"] as const;
const providerValues = ["resend"] as const;

export const workspaceRoleEnum = pgEnum(
  "workspace_role",
  workspaceRoleValues,
);

export const providerEnum = pgEnum("provider", providerValues);

export const workspaces = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
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
  (table) => [index("workspaces_name_idx").on(table.name)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull(),
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
    primaryKey({
      name: "workspace_members_workspace_id_user_id_pk",
      columns: [table.workspaceId, table.userId],
    }),
    index("workspace_members_user_id_idx").on(table.userId),
    index("workspace_members_workspace_role_idx").on(table.workspaceId, table.role),
  ],
);

export const workspaceSendingConfigs = pgTable(
  "workspace_sending_configs",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull().default("resend"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name").notNull(),
    replyToEmail: text("reply_to_email"),
    encryptedApiKey: text("encrypted_api_key").notNull(),
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
    uniqueIndex("workspace_sending_configs_workspace_id_unique").on(table.workspaceId),
  ],
);
