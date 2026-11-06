-- 网易云账号绑定：cookie 以 AES-256-GCM 密文落库（providers/secret-box.ts），明文永不落库
CREATE TABLE "modules.dashboard"."netease_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"netease_uid" bigint NOT NULL,
	"netease_nickname" text NOT NULL,
	"cookie_sealed" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "netease_binding_ws_user_uq" ON "modules.dashboard"."netease_binding" USING btree ("workspace_id","user_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "netease_binding_ws_idx" ON "modules.dashboard"."netease_binding" USING btree ("workspace_id");
