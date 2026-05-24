CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"raw_idea" text NOT NULL,
	"refined_idea" text NOT NULL,
	"model" jsonb,
	"sections" jsonb NOT NULL,
	"references" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "projects_owner_id_idx" ON "projects" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "projects_owner_created_at_idx" ON "projects" USING btree ("owner_id","created_at");