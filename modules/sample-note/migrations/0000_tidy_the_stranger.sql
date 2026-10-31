CREATE SCHEMA "modules.sample_note";
--> statement-breakpoint
CREATE TABLE "modules.sample_note"."note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "note_workspace_created_idx" ON "modules.sample_note"."note" USING btree ("workspace_id","created_at");