CREATE TABLE "prompt_compilations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"mode" text NOT NULL,
	"generation_mode" text NOT NULL,
	"skill_id" text,
	"template_id" text,
	"raw_prompt" text NOT NULL,
	"normalized_brief" jsonb NOT NULL,
	"compiled_prompt" text NOT NULL,
	"creative_controls" jsonb,
	"reference_roles" jsonb,
	"change_summary" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"director_suggestions" jsonb,
	"compiler_provider" text NOT NULL,
	"compiler_model" text,
	"compiler_version" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "prompt_compilation_id" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "prompt_compilation_id" text;