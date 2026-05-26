CREATE TABLE "agent_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"action" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"checkpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"worker_id" text,
	"lease_until" timestamp with time zone,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "agent_tasks_owner_project_idx" ON "agent_tasks" USING btree ("owner_id","project_id");--> statement-breakpoint
CREATE INDEX "agent_tasks_owner_status_idx" ON "agent_tasks" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "agent_tasks_lease_until_idx" ON "agent_tasks" USING btree ("lease_until");