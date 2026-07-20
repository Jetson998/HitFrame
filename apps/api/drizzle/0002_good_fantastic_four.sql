CREATE TABLE "credit_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text DEFAULT 'default' NOT NULL,
	"run_id" text,
	"job_id" text,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_tx_uq" UNIQUE NULLS NOT DISTINCT("tenant_id","run_id","job_id","type")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "queue_job_id" text;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "enqueue_state" text DEFAULT 'pending' NOT NULL;