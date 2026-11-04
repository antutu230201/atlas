CREATE SCHEMA "modules.dashboard";
--> statement-breakpoint
CREATE TABLE "modules.dashboard"."countdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"target_date" date NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules.dashboard"."source_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "countdown_ws_active_idx" ON "modules.dashboard"."countdown" USING btree ("workspace_id","deleted_at","pinned");--> statement-breakpoint
CREATE UNIQUE INDEX "source_cache_ws_key_uq" ON "modules.dashboard"."source_cache" USING btree ("workspace_id","source_key");--> statement-breakpoint
CREATE INDEX "source_cache_ws_idx" ON "modules.dashboard"."source_cache" USING btree ("workspace_id");