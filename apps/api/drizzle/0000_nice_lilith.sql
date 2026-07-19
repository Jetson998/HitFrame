CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"gen_params" jsonb,
	"source_job_id" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"project_id" text,
	"mode" text NOT NULL,
	"template_id" text,
	"endpoint" text NOT NULL,
	"input_params" jsonb NOT NULL,
	"status" text NOT NULL,
	"result_url" text,
	"points_cost" integer,
	"error" text,
	"error_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"project_id" text,
	"mode" text NOT NULL,
	"template_id" text,
	"origin" text NOT NULL,
	"candidate_count" integer NOT NULL,
	"rerun_of_run_id" text,
	"idempotency_key" text NOT NULL,
	"request_params" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "node_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"scene_type" text NOT NULL,
	"endpoint" text NOT NULL,
	"slots" jsonb NOT NULL,
	"vars_schema" jsonb NOT NULL,
	"prompt_template" text NOT NULL,
	"default_params" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"run_id" text,
	"job_id" text,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"provider_usage" jsonb,
	"estimated_cost" numeric,
	"currency" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "runs_idempotency_uq" ON "generation_runs" USING btree ("tenant_id","idempotency_key");