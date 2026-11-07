-- 听歌记录补歌曲封面（心跳上报；报告/榜单嵌封面图）
ALTER TABLE "modules.dashboard"."listening_daily" ADD COLUMN "song_cover" text NOT NULL DEFAULT '';
