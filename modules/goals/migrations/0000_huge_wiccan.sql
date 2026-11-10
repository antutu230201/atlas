CREATE SCHEMA "modules.goals";
--> statement-breakpoint
CREATE TABLE "modules.goals"."key_result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'number' NOT NULL,
	"start_value" double precision DEFAULT 0 NOT NULL,
	"target_value" double precision DEFAULT 1 NOT NULL,
	"current_value" double precision DEFAULT 0 NOT NULL,
	"unit" text,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules.goals"."objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"period" text DEFAULT 'year' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"icon" text DEFAULT '🎯' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "key_result_objective_idx" ON "modules.goals"."key_result" USING btree ("objective_id","deleted_at","sort_order");--> statement-breakpoint
CREATE INDEX "key_result_workspace_idx" ON "modules.goals"."key_result" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "objective_workspace_idx" ON "modules.goals"."objective" USING btree ("workspace_id","archived_at","sort_order");