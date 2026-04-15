CREATE TYPE "public"."delivery_attempt_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"send_job_id" text NOT NULL,
	"provider" "provider" NOT NULL,
	"provider_message_id" text,
	"status" "delivery_attempt_status" NOT NULL,
	"error_code" text,
	"error_message" text,
	"request_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_send_job_id_send_jobs_id_fk" FOREIGN KEY ("send_job_id") REFERENCES "public"."send_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_attempts_workspace_send_job_idx" ON "delivery_attempts" USING btree ("workspace_id","send_job_id");--> statement-breakpoint
CREATE INDEX "delivery_attempts_send_job_requested_idx" ON "delivery_attempts" USING btree ("send_job_id","requested_at");--> statement-breakpoint
CREATE INDEX "delivery_attempts_workspace_requested_idx" ON "delivery_attempts" USING btree ("workspace_id","requested_at");