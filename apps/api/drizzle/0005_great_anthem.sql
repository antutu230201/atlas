-- 全局应用设置表（AI 供应商等部署级配置；0003/0004 为手写迁移，ai_usage/event 列已存在故本条只建 app_setting）
CREATE TABLE "platform"."app_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
