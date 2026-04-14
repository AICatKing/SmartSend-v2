CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_target_type" AS ENUM('all_contacts', 'group_name');--> statement-breakpoint
CREATE TYPE "public"."send_job_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('resend');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"template_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"target_type" "campaign_target_type" NOT NULL,
	"target_group_name" text,
	"queued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"group_name" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "send_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"recipient_email" text NOT NULL,
	"recipient_name" text NOT NULL,
	"rendered_subject" text NOT NULL,
	"rendered_body" text NOT NULL,
	"status" "send_job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"processed_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"provider" "provider" DEFAULT 'resend' NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image_url" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_sending_configs" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"provider" "provider" DEFAULT 'resend' NOT NULL,
	"from_email" text NOT NULL,
	"from_name" text NOT NULL,
	"reply_to_email" text,
	"encrypted_api_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_sending_configs" ADD CONSTRAINT "workspace_sending_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_action_idx" ON "audit_logs" USING btree ("workspace_id","action");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_status_idx" ON "campaigns" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_workspace_created_at_idx" ON "campaigns" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "contacts_workspace_active_idx" ON "contacts" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "contacts_workspace_group_active_idx" ON "contacts" USING btree ("workspace_id","group_name","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_workspace_email_active_unique" ON "contacts" USING btree ("workspace_id","email") WHERE "contacts"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "send_jobs_workspace_campaign_idx" ON "send_jobs" USING btree ("workspace_id","campaign_id");--> statement-breakpoint
CREATE INDEX "send_jobs_workspace_status_scheduled_idx" ON "send_jobs" USING btree ("workspace_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "send_jobs_campaign_status_idx" ON "send_jobs" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "send_jobs_locked_at_idx" ON "send_jobs" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "templates_workspace_active_idx" ON "templates" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_role_idx" ON "workspace_members" USING btree ("workspace_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_sending_configs_workspace_id_unique" ON "workspace_sending_configs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_name_idx" ON "workspaces" USING btree ("name");