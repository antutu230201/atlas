CREATE SCHEMA "modules.journal";
--> statement-breakpoint
CREATE TABLE "modules.journal"."entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text DEFAULT 'daily' NOT NULL,
	"day" date NOT NULL,
	"mood" integer,
	"content" text DEFAULT '' NOT NULL,
	"ai_text" text,
	"ai_polished_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "entry_workspace_kind_day_uq" ON "modules.journal"."entry" USING btree ("workspace_id","kind","day") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "entry_workspace_idx" ON "modules.journal"."entry" USING btree ("workspace_id","kind","day");