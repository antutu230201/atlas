-- 2c：事件携带触发者（RLS 投递上下文）+ 认领时间（僵死回收）
ALTER TABLE "platform"."event" ADD COLUMN "actor_user_id" uuid;
ALTER TABLE "platform"."event" ADD COLUMN "claimed_at" timestamp with time zone;
