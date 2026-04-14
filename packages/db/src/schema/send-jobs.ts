import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { campaigns } from "./campaigns.js";
import { contacts } from "./contacts.js";
import { providerEnum, workspaces } from "./workspaces.js";

export const sendJobStatusEnum = pgEnum("send_job_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "cancelled",
]);

export const sendJobs = pgTable(
  "send_jobs",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name").notNull(),
    renderedSubject: text("rendered_subject").notNull(),
    renderedBody: text("rendered_body").notNull(),
    status: sendJobStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", {
      withTimezone: true,
      mode: "date",
    }),
    lockedBy: text("locked_by"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    provider: providerEnum("provider").notNull().default("resend"),
    providerMessageId: text("provider_message_id"),
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
    index("send_jobs_workspace_campaign_idx").on(table.workspaceId, table.campaignId),
    index("send_jobs_workspace_status_scheduled_idx").on(
      table.workspaceId,
      table.status,
      table.scheduledAt,
    ),
    index("send_jobs_campaign_status_idx").on(table.campaignId, table.status),
    index("send_jobs_locked_at_idx").on(table.lockedAt),
  ],
);
