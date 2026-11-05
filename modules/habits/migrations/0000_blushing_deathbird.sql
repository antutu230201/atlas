CREATE SCHEMA "modules.habits";
--> statement-breakpoint
CREATE TABLE "modules.habits"."habit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT '✅' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modules.habits"."habit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "habit_workspace_idx" ON "modules.habits"."habit" USING btree ("workspace_id","archived_at","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_log_habit_day_uq" ON "modules.habits"."habit_log" USING btree ("habit_id","day");--> statement-breakpoint
CREATE INDEX "habit_log_workspace_idx" ON "modules.habits"."habit_log" USING btree ("workspace_id","day");