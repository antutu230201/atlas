CREATE SCHEMA "platform";
--> statement-breakpoint
CREATE TABLE "platform"."boot_markers" (
	"id" serial PRIMARY KEY NOT NULL,
	"booted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text DEFAULT '' NOT NULL
);
