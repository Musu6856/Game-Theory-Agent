ALTER TABLE "projects" ADD COLUMN "background" jsonb;
ALTER TABLE "projects" ADD COLUMN "literature_analyses" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "projects" ADD COLUMN "hotelling_model" jsonb;
ALTER TABLE "projects" ADD COLUMN "equilibrium_result" jsonb;
ALTER TABLE "projects" ADD COLUMN "property_analyses" jsonb NOT NULL DEFAULT '[]'::jsonb;
