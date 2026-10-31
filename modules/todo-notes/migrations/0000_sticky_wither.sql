CREATE SCHEMA "modules.todo_notes";
--> statement-breakpoint
CREATE TABLE "modules.todo_notes"."todo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "todo_workspace_status_idx" ON "modules.todo_notes"."todo" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "todo_workspace_sort_idx" ON "modules.todo_notes"."todo" USING btree ("workspace_id","sort_order");