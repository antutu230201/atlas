-- 听歌时长（天 × 用户 × 歌曲聚合）：播放器心跳累加；userName 快照免跨 schema 联表
CREATE TABLE "modules.dashboard"."listening_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"user_name" text NOT NULL,
	"day" date NOT NULL,
	"song_id" bigint NOT NULL,
	"song_title" text NOT NULL,
	"song_artist" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listening_daily_uq" ON "modules.dashboard"."listening_daily" USING btree ("workspace_id","user_id","day","song_id");--> statement-breakpoint
CREATE INDEX "listening_daily_ws_day_idx" ON "modules.dashboard"."listening_daily" USING btree ("workspace_id","day");--> statement-breakpoint
CREATE INDEX "listening_daily_ws_user_idx" ON "modules.dashboard"."listening_daily" USING btree ("workspace_id","user_id","day");
