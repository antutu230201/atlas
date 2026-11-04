CREATE TABLE "modules.dashboard"."activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_ws_day_uq" ON "modules.dashboard"."activity" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "activity_ws_day_idx" ON "modules.dashboard"."activity" USING btree ("workspace_id","day");
