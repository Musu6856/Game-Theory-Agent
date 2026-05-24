ALTER TABLE "projects" ADD COLUMN "project_type" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "research_session" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "model_source" jsonb;