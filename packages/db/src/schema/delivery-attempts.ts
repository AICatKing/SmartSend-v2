import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { sendJobs } from "./send-jobs.js";
import { providerEnum, workspaces } from "./workspaces.js";

export const deliveryAttemptStatusEnum = pgEnum("delivery_attempt_status", [
  "sent",
  "failed",
]);

export const deliveryAttempts = pgTable(
  "delivery_attempts",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sendJobId: text("send_job_id")
      .notNull()
      .references(() => sendJobs.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: deliveryAttemptStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    requestPayloadJson: jsonb("request_payload_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    responsePayloadJson: jsonb("response_payload_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => [
    index("delivery_attempts_workspace_send_job_idx").on(
      table.workspaceId,
      table.sendJobId,
    ),
    index("delivery_attempts_send_job_requested_idx").on(
      table.sendJobId,
      table.requestedAt,
    ),
    index("delivery_attempts_workspace_requested_idx").on(
      table.workspaceId,
      table.requestedAt,
    ),
  ],
);
