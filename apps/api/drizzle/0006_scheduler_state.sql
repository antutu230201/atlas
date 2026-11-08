-- 内部调度状态（服务端专用：无租户语义、不启用 RLS；atlas_app 经默认权限获得增删改查）
CREATE TABLE "platform"."scheduler_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
