CREATE TABLE "generation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"actor_id" text,
	"run_id" text,
	"job_id" text,
	"request_id" text,
	"event" text NOT NULL,
	"status" text,
	"mode" text,
	"template_id" text,
	"endpoint" text,
	"attempt_no" integer,
	"provider" text,
	"model" text,
	"user_prompt" text,
	"compiled_prompt" text,
	"input_params" jsonb,
	"result_asset_id" text,
	"result_url" text,
	"result_bytes" integer,
	"provider_usage" jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"provider_request_id" text,
	"provider_http_status" integer,
	"error_kind" text,
	"error_code" text,
	"error_message" text,
	"request_ip" text,
	"channel_id" text,
	"group_id" text,
	"rate_multiplier" numeric,
	"price_version" text,
	"estimated_cost" numeric,
	"currency" text,
	"points_cost" integer,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"provider_duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "actor_id" text;--> statement-breakpoint
CREATE INDEX "generation_logs_run_created_idx" ON "generation_logs" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_logs_job_created_idx" ON "generation_logs" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_logs_event_created_idx" ON "generation_logs" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "generation_logs_actor_created_idx" ON "generation_logs" USING btree ("actor_id","created_at");