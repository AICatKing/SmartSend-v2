import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces.js";

type ContactCustomFieldValue = string | number | boolean | null;
type ContactCustomFields = Record<string, ContactCustomFieldValue>;

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    groupName: text("group_name"),
    customFields: jsonb("custom_fields")
      .$type<ContactCustomFields>()
      .notNull()
      .default(sql`'{}'::jsonb`),
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
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      mode: "date",
    }),
  },
  (table) => [
    index("contacts_workspace_active_idx").on(table.workspaceId, table.deletedAt),
    index("contacts_workspace_group_active_idx").on(
      table.workspaceId,
      table.groupName,
      table.deletedAt,
    ),
    uniqueIndex("contacts_workspace_email_active_unique")
      .on(table.workspaceId, table.email)
      .where(sql`${table.deletedAt} is null`),
  ],
);
