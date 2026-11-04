-- 阶段 5：AI 调用用量追踪表（ops.aiUsage；此前只加了 schema 未生成迁移，导致 platform.ai_usage 缺失）
CREATE TABLE IF NOT EXISTS "platform"."ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"module_name" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform"."ai_usage" ADD CONSTRAINT "ai_usage_workspace_id_workspace_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspace"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform"."ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "platform"."user"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_workspace_idx" ON "platform"."ai_usage" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_usage_user_idx" ON "platform"."ai_usage" USING btree ("user_id","created_at");
